import {
  For,
  createSignal,
  Show,
  createMemo,
  onMount,
  onCleanup,
  createEffect,
  batch,
  on,
} from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import type { ExploreResponse, SpaceNode } from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";
import { initNodesFromApiResponse } from "~/lib/space";
import ExpressionListItem, { type FlatNode } from "./ExpressionListItem";

// Define the shape of the data sent to the worker
interface WorkerMessageData {
  nodes?: SpaceNode[];
  expandedNodeIds?: string[];
  childrenMap?: [string, SpaceNode[]][];
  rawResponse?: string;
}

interface ExpressionListProps {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  onNodeClick?: (node: SpaceNode) => void;
  ref?: (api: { expandAll: () => void; collapseToRoot: () => void }) => void;
  isIndented: boolean;
}

// Capability detection
const hasWorkerSupport = typeof Worker !== "undefined";
const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";

export default function ExpressionList(props: ExpressionListProps) {
  let scrollRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let worker: Worker | null = null;
  let messageIdCounter = 0;
  const pendingMessages = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(
    new Set<string>()
  );
  const [childrenMap, setChildrenMap] = createSignal<Map<string, SpaceNode[]>>(
    new Map()
  );
  const [cursorLine, setCursorLine] = createSignal<number>(0);
  const [isFocused, setIsFocused] = createSignal<boolean>(false);
  const [isProcessing, setIsProcessing] = createSignal<boolean>(false);
  const [workerReady, setWorkerReady] = createSignal<boolean>(false);
  const [workerStats, setWorkerStats] = createSignal({
    tasksProcessed: 0,
    lastTaskTime: 0,
    totalTime: 0,
  });

  const [flattenedNodes, setFlattenedNodes] = createSignal<FlatNode[]>([]);
  const [isFlattening, setIsFlattening] = createSignal<boolean>(false);

  const [onFlattenComplete, setOnFlattenComplete] = createSignal<
    (() => void) | null
  >(null);

  let savedScrollTop = 0;

  if (hasWorkerSupport && !worker) {
    try {
      worker = new Worker(
        new URL("../../../workers/nodeProcessor.worker.ts", import.meta.url),
        { type: "module" }
      );

      worker.onmessage = (event) => {
        const { type, id, data, error, timing } = event.data;

        if (type === "READY") {
          setWorkerReady(true);
          return;
        }

        if (timing) {
          setWorkerStats((prev) => ({
            tasksProcessed: prev.tasksProcessed + 1,
            lastTaskTime: timing,
            totalTime: prev.totalTime + timing,
          }));
        }

        const pending = pendingMessages.get(id);
        if (pending) {
          pendingMessages.delete(id);
          if (type === "ERROR") {
            pending.reject(new Error(error));
          } else {
            pending.resolve(data);
          }
        }
      };

      worker.onerror = () => {
        setWorkerReady(false);
        pendingMessages.forEach(({ reject }) => {
          reject(new Error("Worker error"));
        });
        pendingMessages.clear();
      };
    } catch {
      worker = null;
    }
  }

  onMount(() => {
    containerRef?.focus();
  });

  onCleanup(() => {
    if (worker) {
      worker.terminate();
      worker = null;
      setWorkerReady(false);
    }
    pendingMessages.clear();
  });

  const sendWorkerMessage = <T,>(
    type: string,
    data: WorkerMessageData,
    sharedBuffer?: SharedArrayBuffer
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!worker || !workerReady()) {
        reject(new Error("Worker not available"));
        return;
      }

      const id = `msg_${++messageIdCounter}`;

      pendingMessages.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      worker.postMessage({
        type,
        id,
        data,
        useSharedMemory: hasSharedArrayBuffer,
        sharedBuffer: sharedBuffer,
      });

      setTimeout(() => {
        if (pendingMessages.has(id)) {
          pendingMessages.delete(id);
          reject(new Error("Worker timeout"));
        }
      }, 30000);
    });
  };

  const flattenNodesMainThread = (
    nodes: SpaceNode[],
    expanded: Set<string>,
    children: Map<string, SpaceNode[]>
  ): FlatNode[] => {
    const result: FlatNode[] = [];
    const visited = new Set<string>();

    const addNode = (node: SpaceNode, depth: number, path: string) => {
      if (visited.has(path)) return;
      visited.add(path);

      result.push({ node, id: path, depth });

      if (expanded.has(path) && children.has(path)) {
        const nodeChildren = children.get(path)!;
        nodeChildren.forEach((child, index) => {
          const childPath = `${path}/${getNodeId(child)}#${index}`;
          addNode(child, depth + 1, childPath);
        });
      }
    };

    nodes.forEach((node, index) => {
      const rootPath = `${getNodeId(node)}#${index}`;
      addNode(node, 0, rootPath);
    });

    return result;
  };

  createEffect(
    on(
      () =>
        [props.data.nodes, expandedNodes(), childrenMap()] as [
          SpaceNode[],
          Set<string>,
          Map<string, SpaceNode[]>,
        ],
      async ([nodes, expanded, children]) => {
        setIsFlattening(true);

        try {
          if (workerReady()) {
            try {
              const result = await sendWorkerMessage<FlatNode[]>(
                "FLATTEN_NODES",
                {
                  nodes: nodes,
                  expandedNodeIds: Array.from(expanded),
                  childrenMap: Array.from(children.entries()),
                }
              );
              setFlattenedNodes(result);
            } catch {
              const result = flattenNodesMainThread(nodes, expanded, children);
              setFlattenedNodes(result);
            }
          } else {
            const result = flattenNodesMainThread(nodes, expanded, children);
            setFlattenedNodes(result);
          }
        } finally {
          setIsFlattening(false);

          const callback = onFlattenComplete();
          if (callback) {
            queueMicrotask(() => {
              callback();
              setOnFlattenComplete(null);
            });
          }
        }
      }
    )
  );

  const expandAll = () => {
    const allExpandableIds = new Set<string>();
    const children = childrenMap();
    for (const [id, childNodes] of children.entries()) {
      if (childNodes.length > 0) {
        allExpandableIds.add(id);
      }
    }
    setExpandedNodes(allExpandableIds);
  };

  const collapseToRoot = () => {
    setExpandedNodes(new Set<string>());
  };

  if (props.ref) {
    props.ref({ expandAll, collapseToRoot });
  }

  const getNodeId = (node: SpaceNode) =>
    node.remoteData.token
      ? Array.from(node.remoteData.token).join(",")
      : node.label;

  const isExpandable = (node: SpaceNode) => {
    if (!node.remoteData.token || node.remoteData.token.length === 0) {
      return false;
    }

    if (node.remoteData.token.length === 1 && node.remoteData.token[0] === -1) {
      return false;
    }

    const allMinusOne = Array.from(node.remoteData.token).every(
      (val) => val === -1
    );
    if (allMinusOne) {
      return false;
    }

    return true;
  };

  const virtualizer = createMemo(() =>
    createVirtualizer({
      get count() {
        return flattenedNodes().length;
      },
      getScrollElement: () => scrollRef || null,
      estimateSize: () => 24,
      overscan: 20,
      getItemKey: (index) => flattenedNodes()[index]?.id ?? index,
    })
  );

  const toggleNode = async (flatNode: FlatNode) => {
    const { node, id: nodePath } = flatNode;
    const expanded = expandedNodes();

    if (scrollRef) {
      savedScrollTop = scrollRef.scrollTop;
    }

    if (expanded.has(nodePath)) {
      const newExpanded = new Set(expanded);
      newExpanded.delete(nodePath);

      setOnFlattenComplete(() => () => {
        if (scrollRef) {
          scrollRef.scrollTop = savedScrollTop;
        }
      });

      setExpandedNodes(newExpanded);
      return;
    }

    if (!isExpandable(node)) {
      props.onNodeClick?.(node);
      return;
    }

    setIsProcessing(true);

    setOnFlattenComplete(() => () => {
      if (scrollRef) {
        scrollRef.scrollTop = savedScrollTop;
      }
    });

    let expansionSucceeded = false;
    try {
      const response = await exploreSpace(
        formatedNamespace(),
        props.pattern,
        node.remoteData.token
      );

      let parsed: ExploreResponse[];

      if (workerReady()) {
        try {
          let result: { parsed: ExploreResponse[] };

          if (hasSharedArrayBuffer) {
            // If SAB is supported, encode and send the buffer
            const encoder = new TextEncoder();
            const encodedString = encoder.encode(response);
            const buffer = new SharedArrayBuffer(encodedString.length);
            const view = new Uint8Array(buffer);
            view.set(encodedString);

            // Pass the buffer as the third argument
            result = await sendWorkerMessage<{ parsed: ExploreResponse[] }>(
              "PROCESS_NODES",
              {}, // Data object can be empty now
              buffer
            );
          } else {
            // Fallback for browsers without SAB support
            result = await sendWorkerMessage<{ parsed: ExploreResponse[] }>(
              "PROCESS_NODES",
              { rawResponse: response }
            );
          }
          parsed = result.parsed;
        } catch {
          parsed = JSON.parse(response) as ExploreResponse[];
        }
      } else {
        parsed = JSON.parse(response) as ExploreResponse[];
      }

      if (parsed && parsed.length > 0) {
        const processedData = initNodesFromApiResponse(parsed);

        if (processedData.nodes.length > 0) {
          batch(() => {
            setChildrenMap(
              new Map(childrenMap()).set(nodePath, processedData.nodes)
            );
            setExpandedNodes(new Set(expanded).add(nodePath));
          });

          expansionSucceeded = true;
        } else {
          setChildrenMap(new Map(childrenMap()).set(nodePath, []));
          expansionSucceeded = true;
        }
      } else {
        setChildrenMap(new Map(childrenMap()).set(nodePath, []));
        expansionSucceeded = true;
      }
    } catch (error) {
      if (error instanceof Error && error.message === "noRootToken") {
        showToast({
          title: "Token Not Set",
          description: "Please set the token in the Tokens page.",
          variant: "destructive",
        });
      } else {
        showToast({
          title: "Error",
          description: `An error occurred expanding the node. \n ${error}`,
          variant: "destructive",
        });
      }
    } finally {
      setIsProcessing(false);

      if (!expansionSucceeded) {
        setOnFlattenComplete(null);
      }
    }
  };

  const stats = createMemo(() => workerStats());

  return (
    <div
      ref={containerRef!}
      tabIndex={0}
      class="w-full h-full overflow-hidden relative focus:outline-none"
      style={{
        "background-color": "#1e1e1e",
        "font-family": "'Consolas', 'Courier New', monospace",
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {/* Editor header bar */}
      <div
        class="h-8 flex items-center px-4 border-b text-xs"
        style={{
          "background-color": "#2d2d2d",
          "border-color": "#3e3e3e",
          color: "#cccccc",
        }}
      >
        <span class="opacity-60">Code Explorer</span>
        <Show when={isProcessing() || isFlattening()}>
          <span class="ml-2 opacity-40">⏳ Processing...</span>
        </Show>

        {/* Worker status */}
        <div class="ml-auto flex items-center gap-2 text-[10px]">
          <Show when={workerReady()}>
            <span class="opacity-60">
              ✅ Worker
              <Show when={stats().tasksProcessed > 0}>
                <span class="ml-1 opacity-40">
                  ({stats().tasksProcessed} tasks, avg{" "}
                  {(stats().totalTime / stats().tasksProcessed).toFixed(1)}ms)
                </span>
              </Show>
            </span>
          </Show>
          <Show when={!workerReady()}>
            <span class="opacity-40">
              {hasWorkerSupport ? "⏳ Initializing..." : "⚠️ Fallback"}
            </span>
          </Show>

          <Show when={hasSharedArrayBuffer}>
            <span class="opacity-30">| SAB ✓</span>
          </Show>
        </div>
      </div>

      {/* Main editor area */}
      <div
        ref={scrollRef!}
        class="w-full overflow-auto"
        style={{
          height: "calc(100% - 2rem)",
          "scrollbar-width": "thin",
          "scrollbar-color": "#424242 #1e1e1e",
        }}
      >
        <div
          style={{
            height: `${virtualizer().getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          <For each={virtualizer().getVirtualItems()}>
            {(virtualItem) => {
              const flatNode = flattenedNodes()[virtualItem.index];
              if (!flatNode) return null;

              const isExpanded = expandedNodes().has(flatNode.id);
              const canExpand = isExpandable(flatNode.node);
              const hasChildren = childrenMap().has(flatNode.id);
              const childCount = hasChildren
                ? childrenMap().get(flatNode.id)!.length
                : 0;
              const isLeaf = hasChildren && childCount === 0;
              const isCursor = cursorLine() === virtualItem.index;

              return (
                <ExpressionListItem
                  virtualItem={virtualItem}
                  flatNode={flatNode}
                  isExpanded={isExpanded}
                  canExpand={canExpand}
                  isLeaf={isLeaf}
                  isCursor={isCursor}
                  isIndented={props.isIndented}
                  onClick={() => {
                    setCursorLine(virtualItem.index);
                    toggleNode(flatNode);
                  }}
                />
              );
            }}
          </For>
        </div>
      </div>

      {/* Cursor indicator when focused */}
      <Show when={isFocused()}>
        <div
          class="absolute left-0 w-0.5 h-6 animate-pulse"
          style={{
            top: `${2 + cursorLine() * 24}rem`,
            "background-color": "#007acc",
          }}
        />
      </Show>
    </div>
  );
}
