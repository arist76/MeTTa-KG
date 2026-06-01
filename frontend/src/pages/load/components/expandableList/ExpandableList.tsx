import {
  For,
  Show,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
  on,
} from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import type { SpaceNode } from "~/lib/space";
import { formatedNamespace } from "~/lib/state";
import ExpressionListItem from "./ExpressionListItem";
import { treeStore, type FlatNode } from "./store";
import { showToast } from "~/components/ui/Toast";
import { reportError } from "~/lib/errors";
import { shouldFillViewport, setShouldFillViewport } from "../../lib";

interface Props {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  onNodeClick?: (node: SpaceNode) => void;
  ref?: (api: {
    expandAll: () => void;
    collapseToRoot: () => void;
    expandToFillViewport: () => Promise<void>;
  }) => void;
  isIndented: boolean;
}

export default function ExpressionList(props: Props) {
  let scrollRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  const flattenedNodes = createMemo<FlatNode[]>(() =>
    treeStore.createFlattenedNodes(props.data)
  );

  const getScrollElement = () => scrollRef ?? null;

  const virtualizer = createMemo(() =>
    createVirtualizer({
      get count() {
        return flattenedNodes().length;
      },
      getScrollElement,
      estimateSize: () => 24,
      overscan: 20,
      getItemKey: (i: number) => flattenedNodes()[i]?.id ?? i,
    })
  );

  const doExpandToFillViewport = async () => {
    if (!scrollRef || !props.data?.nodes?.length) return;

    treeStore.setExpanding(true);
    await new Promise((r) => requestAnimationFrame(r));

    const targetCount = Math.ceil(scrollRef.clientHeight / 24);

    try {
      await treeStore.expandToFillViewport(targetCount, props.pattern, () =>
        flattenedNodes()
      );
    } catch (e) {
      reportError("explore", e);
    } finally {
      treeStore.setExpanding(false);
    }
  };

  createEffect(
    on(
      () => [shouldFillViewport(), props.data] as const,
      async ([should, data]) => {
        if (should && data?.nodes?.length) {
          setShouldFillViewport(false);
          if (treeStore.isExpanding) return;
          treeStore.setExpanding(true);
          await new Promise((r) => requestAnimationFrame(r));
          await doExpandToFillViewport();
        }
      }
    )
  );

  createEffect(
    on(formatedNamespace, async (ns) => {
      if (treeStore.namespace !== ns) {
        treeStore.reset();
        treeStore.setNamespace(ns);
        if (!props.data?.nodes?.length) return;
        treeStore.setExpanding(true);
        await new Promise((r) => requestAnimationFrame(r));
        await doExpandToFillViewport();
      }
    })
  );

  props.ref?.({
    expandAll: treeStore.expandAll,
    collapseToRoot: treeStore.collapseToRoot,
    expandToFillViewport: doExpandToFillViewport,
  });

  const handleToggle = async (flatNode: FlatNode, e: MouseEvent) => {
    e.stopPropagation();
    treeStore.setCursor(flattenedNodes().indexOf(flatNode));

    if (e.ctrlKey || e.metaKey) {
      await treeStore.expandToLeaf(flatNode, props.pattern);
    } else {
      await treeStore.toggleNode(flatNode, props.pattern, props.onNodeClick);
    }
  };

  onMount(async () => {
    if (scrollRef) {
      treeStore.setScrollRef(scrollRef);
      treeStore.restoreScroll();

      if (!treeStore.initialExpansionDone) {
        await doExpandToFillViewport();
      }
    }
  });

  onCleanup(() => {
    treeStore.saveScroll();
    treeStore.setScrollRef(null);
  });

  return (
    <div
      ref={containerRef!}
      class="w-full h-full overflow-hidden relative bg-background border border-border rounded-lg"
      style={{
        "font-family": "var(--font-family)",
      }}
    >
      <div class="h-8 flex items-center px-4 border-b border-border bg-muted/50 text-xs">
        <span class="text-muted-foreground">Code Explorer</span>
      </div>

      <div class="relative" style={{ height: "calc(100% - 2rem)" }}>
        <div
          ref={(el) => {
            scrollRef = el;
            treeStore.setScrollRef(el);
          }}
          class="w-full h-full overflow-auto custom-scrollbar"
        >
          <div
            style={{
              height: `${virtualizer().getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            <For each={virtualizer().getVirtualItems()}>
              {(vi) => {
                const fn = flattenedNodes()[vi.index];
                if (!fn) return null;
                return (
                  <ExpressionListItem
                    virtualItem={vi}
                    flatNode={fn}
                    isExpanded={treeStore.expandedNodes.has(fn.id)}
                    canExpand={treeStore.isExpandable(fn.node)}
                    isLeaf={
                      treeStore.childrenMap.has(fn.id) &&
                      treeStore.childrenMap.get(fn.id)!.length === 0
                    }
                    isCursor={treeStore.cursorLine === vi.index}
                    isIndented={props.isIndented}
                    isExpandingToLeaf={treeStore.expandingNodeId === fn.id}
                    onClick={(e) => handleToggle(fn, e)}
                  />
                );
              }}
            </For>
          </div>
        </div>

        <Show when={treeStore.isExpanding}>
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
            <div class="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mb-4 glow" />
            <span class="text-foreground text-sm font-medium">
              Expanding...
            </span>
          </div>
        </Show>
      </div>
    </div>
  );
}
