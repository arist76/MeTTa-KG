import { For, createSignal, Show, createMemo, onMount, onCleanup } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import type { ExploreResponse, SpaceNode } from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";
import { initNodesFromApiResponse } from "~/lib/space";
import ExpressionListItem, { type FlatNode } from "./ExpressionListItem";

// Debug logger
const debug = {
  log: (message: string, data?: any) => {
    console.log(`[ExpandableList] ${message}`, data || '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ExpandableList Error] ${message}`, error || '');
  },
  time: (label: string) => {
    console.time(`[ExpandableList] ${label}`);
  },
  timeEnd: (label: string) => {
    console.timeEnd(`[ExpandableList] ${label}`);
  }
};

interface ExpressionListProps {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  onNodeClick?: (node: SpaceNode) => void;
  ref?: (api: { expandAll: () => void; collapseToRoot: () => void }) => void;
  isIndented: boolean;
}

// Capability detection
const hasWorkerSupport = typeof Worker !== 'undefined';
const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
debug.log('✅ Capabilities detected', { hasWorkerSupport, hasSharedArrayBuffer });

export default function ExpressionList(props: ExpressionListProps) {
  let scrollRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let worker: Worker | null = null;
  let messageIdCounter = 0;
  const pendingMessages = new Map<string, { resolve: Function; reject: Function }>();

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
    totalTime: 0
  });

  let savedScrollTop = 0;

  // Initialize worker immediately
  if (hasWorkerSupport && !worker) {
    try {
      debug.log('🚀 Initializing worker...');
      worker = new Worker(
        new URL('../../../workers/nodeProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event) => {
        const { type, id, data, error, timing } = event.data;
        
        if (type === 'READY') {
          debug.log('✅ Worker ready and operational');
          setWorkerReady(true);
          return;
        }

        debug.log(`📨 Worker response: ${type}`, { 
          id, 
          timing: timing ? `${timing.toFixed(2)}ms` : 'N/A' 
        });

        // Update stats
        if (timing) {
          setWorkerStats(prev => ({
            tasksProcessed: prev.tasksProcessed + 1,
            lastTaskTime: timing,
            totalTime: prev.totalTime + timing
          }));
        }

        const pending = pendingMessages.get(id);
        if (pending) {
          pendingMessages.delete(id);
          if (type === 'ERROR') {
            debug.error('❌ Worker returned error', error);
            pending.reject(new Error(error));
          } else {
            pending.resolve(data);
          }
        }
      };

      worker.onerror = (error) => {
        debug.error('💥 Worker error', error);
        setWorkerReady(false);
        // Reject all pending messages
        pendingMessages.forEach(({ reject }) => {
          reject(new Error('Worker error'));
        });
        pendingMessages.clear();
      };

      debug.log('⏳ Worker created, waiting for ready signal...');
    } catch (error) {
      debug.error('❌ Failed to initialize worker', error);
      worker = null;
    }
  } else if (!hasWorkerSupport) {
    debug.log('⚠️ Worker not supported, will use main thread');
  }

  onMount(() => {
    debug.log('🎯 Component mounted', { workerReady: workerReady() });
    containerRef?.focus();
  });

  onCleanup(() => {
    if (worker) {
      const stats = workerStats();
      debug.log('🛑 Terminating worker', {
        tasksProcessed: stats.tasksProcessed,
        avgTime: stats.tasksProcessed > 0 
          ? `${(stats.totalTime / stats.tasksProcessed).toFixed(2)}ms` 
          : 'N/A'
      });
      worker.terminate();
      worker = null;
      setWorkerReady(false);
    }
    pendingMessages.clear();
  });

  // Send message to worker with promise-based API
  const sendWorkerMessage = <T,>(type: string, data: any): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!worker || !workerReady()) {
        debug.log('⚠️ Worker not available', { worker: !!worker, ready: workerReady() });
        reject(new Error('Worker not available'));
        return;
      }

      const id = `msg_${++messageIdCounter}`;
      pendingMessages.set(id, { resolve, reject });

      const dataSize = JSON.stringify(data).length;
      debug.log(`📤 Sending to worker: ${type}`, { id, dataSize });
      
      worker.postMessage({
        type,
        id,
        data,
        useSharedMemory: hasSharedArrayBuffer
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingMessages.has(id)) {
          pendingMessages.delete(id);
          debug.error('⏱️ Worker timeout', { type, id });
          reject(new Error('Worker timeout'));
        }
      }, 30000);
    });
  };

  // Main thread fallback for flattening
  const flattenNodesMainThread = (
    nodes: SpaceNode[],
    expanded: Set<string>,
    children: Map<string, SpaceNode[]>
  ): FlatNode[] => {
    debug.time('🔧 Flatten on main thread');
    
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

    debug.timeEnd('🔧 Flatten on main thread');
    debug.log('✅ Main thread flattened', { count: result.length });
    
    return result;
  };

  const expandAll = () => {
    debug.log('🔽 Expanding all nodes');
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
    debug.log('🔼 Collapsing to root');
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

  // Flattened nodes - always use main thread (memo must be synchronous)
  const flattenedNodes = createMemo<FlatNode[]>(() => {
    const nodes = props.data.nodes;
    const expanded = expandedNodes();
    const children = childrenMap();

    // Note: createMemo must be synchronous, so we always use main thread here
    // Worker would only be beneficial for async operations like API responses
    return flattenNodesMainThread(nodes, expanded, children);
  });

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
      debug.log('➖ Collapsing node', { nodePath });
      const newExpanded = new Set(expanded);
      newExpanded.delete(nodePath);
      setExpandedNodes(newExpanded);
      return;
    }

    if (!isExpandable(node)) {
      debug.log('🖱️ Node clicked (not expandable)', { nodePath });
      props.onNodeClick?.(node);
      return;
    }

    setIsProcessing(true);
    debug.time('⚡ Toggle node');

    try {
      debug.log('🌐 Fetching node data', { nodePath });
      const response = await exploreSpace(
        formatedNamespace(),
        props.pattern,
        node.remoteData.token
      );

      debug.log('📥 API response received', { 
        length: response.length,
        workerReady: workerReady()
      });

      // Always use worker if available, fallback to main thread only on error
      let parsed: ExploreResponse[];
      
      if (workerReady()) {
        debug.log('⚙️ Using worker to process API response');
        try {
          const result = await sendWorkerMessage<{ parsed: ExploreResponse[] }>(
            'PROCESS_NODES',
            { rawResponse: response }
          );
          parsed = result.parsed;
          debug.log('✅ Worker processed successfully');
        } catch (workerError) {
          debug.error('❌ Worker failed, using main thread fallback', workerError);
          debug.time('🔧 Main thread JSON parse (fallback)');
          parsed = JSON.parse(response) as ExploreResponse[];
          debug.timeEnd('🔧 Main thread JSON parse (fallback)');
        }
      } else {
        debug.log('🔧 Worker not ready, using main thread');
        debug.time('🔧 Main thread JSON parse');
        parsed = JSON.parse(response) as ExploreResponse[];
        debug.timeEnd('🔧 Main thread JSON parse');
      }

      if (parsed && parsed.length > 0) {
        debug.log('🔨 Processing parsed data', { itemCount: parsed.length });
        const processedData = initNodesFromApiResponse(parsed);

        if (processedData.nodes.length > 0) {
          setChildrenMap(
            new Map(childrenMap()).set(nodePath, processedData.nodes)
          );
          setExpandedNodes(new Set(expanded).add(nodePath));
          debug.log('✅ Node expanded', { nodePath, childCount: processedData.nodes.length });
        } else {
          setChildrenMap(new Map(childrenMap()).set(nodePath, []));
          debug.log('📭 Node has no children', { nodePath });
        }
      } else {
        setChildrenMap(new Map(childrenMap()).set(nodePath, []));
        debug.log('📭 Empty response', { nodePath });
      }
    } catch (error) {
      debug.error('❌ Error toggling node', error);
      
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
      debug.timeEnd('⚡ Toggle node');
      
      queueMicrotask(() => {
        if (scrollRef) {
          scrollRef.scrollTop = savedScrollTop;
        }
      });
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
        <Show when={isProcessing()}>
          <span class="ml-2 opacity-40">⏳ Processing...</span>
        </Show>
        
        {/* Worker status */}
        <div class="ml-auto flex items-center gap-2 text-[10px]">
          <Show when={workerReady()}>
            <span class="opacity-60">
              ✅ Worker
              <Show when={stats().tasksProcessed > 0}>
                <span class="ml-1 opacity-40">
                  ({stats().tasksProcessed} tasks, avg {(stats().totalTime / stats().tasksProcessed).toFixed(1)}ms)
                </span>
              </Show>
            </span>
          </Show>
          <Show when={!workerReady()}>
            <span class="opacity-40">
              {hasWorkerSupport ? '⏳ Worker: Initializing...' : '⚠️ Fallback Mode'}
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