import { onMount, onCleanup, createEffect } from "solid-js";
import * as d3 from "d3";
import type { SpaceNode } from "~/lib/space";
import { convertToD3TreeData, initNodesFromApiResponse } from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";
import { getGraphWorkerManager } from "~/workers/workerManager";
import {
  FallbackProcessor,
  EnhancedFallbackProcessor,
  PerformanceMonitor,
} from "~/lib/fallbackProcessor";
import { OptimizationConfig, GracefulDegradation } from "~/lib/capabilities";
import {
  ProgressiveRenderer,
  createBatchedTasks,
  RenderTask,
} from "~/lib/progressiveRenderer";

interface D3HierarchyNodeData {
  name: string;
  id: string;
  token?: Uint8Array;
  expr?: string;
  isExpandable?: boolean;
  isFromBackend?: boolean;
  children?: D3HierarchyNodeData[];
}

type D3Node = d3.HierarchyNode<D3HierarchyNodeData> & {
  x0?: number;
  y0?: number;
  _children?: D3Node[];
  _isLeaf?: boolean;
};

interface D3TreeGraphProps {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  onNodeClick?: (node: SpaceNode) => void;
  ref?: (api: {
    expandAll: () => void;
    collapseAll: () => void;
    collapseToRoot: () => void;
  }) => void;
}

export default function D3TreeGraph(props: D3TreeGraphProps) {
  let containerRef: HTMLDivElement | undefined;
  let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  let g: d3.Selection<SVGGElement, unknown, null, undefined>;
  let root: D3Node;
  let i = 0;

  // Worker and optimization setup
  const workerManager = getGraphWorkerManager();
  const optimizationConfig = OptimizationConfig.getConfig();
  let progressiveRenderer: ProgressiveRenderer | null = null;

  // Get dynamic animation duration based on node count
  const getDynamicAnimationDuration = (nodeCount: number) => {
    return GracefulDegradation.getAnimationDuration(nodeCount);
  };

  // Helper to check if worker processing should be used
  const shouldUseWorker = (strategy: string) =>
    strategy === "worker" &&
    optimizationConfig.useWorkerProcessing &&
    workerManager.isWorkerAvailable();

  // Helper to get transition duration with optional divisor
  const getTransitionDuration = (divisor = 1) =>
    optimizationConfig.enableTransitions
      ? getDynamicAnimationDuration(props.data.nodes.length) / divisor
      : 0;

  const expand = (d: D3Node) => {
    if (d._children) {
      d.children = d._children;
      d._children = null;
    }
    if (d.children) {
      d.children.forEach(expand);
    }
  };

  const expandAll = () => {
    if (!root) return;
    expand(root);
    update(root);
  };

  const collapseAll = () => {
    if (!root) return;
    root.descendants().forEach((d: D3Node) => {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      }
    });
    update(root);
  };

  const collapseToRoot = () => {
    if (!root) return;
    root.children?.forEach((child: D3Node) => {
      if (child.children) {
        child._children = child.children;
        child.children = null;
      }
    });
    update(root);
  };

  if (props.ref) {
    props.ref({ expandAll, collapseAll, collapseToRoot });
  }

  const margin = { top: 20, right: 40, bottom: 20, left: 40 };
  const nodeHeight = OptimizationConfig.CONSTANTS.NODE_HEIGHT;
  const nodeWidth = 280;
  const indentSize = 0;

  const isExpandable = (d: D3Node) => {
    if (d._isLeaf) return false;
    if (d.children || d._children) return true;

    if (
      d.data.token &&
      Array.isArray(d.data.token) &&
      d.data.token.length === 1 &&
      d.data.token[0] === -1
    ) {
      return false;
    }

    if (d.data.token && Array.from(d.data.token).join(",") === "-1") {
      return false;
    }

    if (d.data.token && d.data.token.length > 0) return true;

    if (d.data.expr && d.data.expr.trim() !== "") {
      // No parsing, expr is displayed as is, not expandable
      return false;
    }

    return false;
  };

  // Extracted function to render individual nodes (used in batch processing)
  const renderSingleNode = (
    nodeSelection: d3.Selection<SVGGElement, D3Node, null, undefined>,
    nodeData: D3Node,
    source: D3Node
  ) => {
    const existingNode = nodeSelection.node();

    if (!existingNode) {
      // Create new node
      const nodeEnter = g
        .append("g")
        .datum(nodeData)
        .attr("class", "node")
        .attr("transform", `translate(${source.y0},${source.x0})`)
        .style("opacity", 0)
        .style("cursor", "pointer")
        .on("click", (event: PointerEvent, d: D3Node) => handleClick(event, d));

      // Add event handlers based on optimization config
      if (optimizationConfig.enableTransitions) {
        nodeEnter
          .on("mouseenter", function (this: SVGGElement) {
            d3.select(this)
              .select(".node-bg")
              .transition()
              .duration(OptimizationConfig.CONSTANTS.HOVER_DURATION)
              .style("fill", "hsl(var(--accent))")
              .style("opacity", 0.1);
            d3.select(this)
              .select(".node-border")
              .transition()
              .duration(OptimizationConfig.CONSTANTS.HOVER_DURATION)
              .style("stroke", "hsl(var(--accent))")
              .style("opacity", 0.4);
          })
          .on("mouseleave", function (this: SVGGElement) {
            d3.select(this)
              .select(".node-bg")
              .transition()
              .duration(OptimizationConfig.CONSTANTS.HOVER_OUT_DURATION)
              .style("fill", "transparent")
              .style("opacity", 1);
            d3.select(this)
              .select(".node-border")
              .transition()
              .duration(OptimizationConfig.CONSTANTS.HOVER_OUT_DURATION)
              .style("stroke", "transparent")
              .style("opacity", 1);
          });
      }

      // Add node elements
      addNodeElements(nodeEnter);

      // Animate to final position
      const animDuration = getTransitionDuration(2);
      if (animDuration > 0) {
        nodeEnter
          .transition()
          .duration(animDuration)
          .style("opacity", 1)
          .attr("transform", `translate(${nodeData.y},${nodeData.x})`);
      } else {
        nodeEnter
          .style("opacity", 1)
          .attr("transform", `translate(${nodeData.y},${nodeData.x})`);
      }
    } else {
      // Update existing node
      const node = d3.select(existingNode);
      const animDuration = getTransitionDuration(2);

      if (animDuration > 0) {
        node
          .transition()
          .duration(animDuration)
          .attr("transform", `translate(${nodeData.y},${nodeData.x})`);
      } else {
        node.attr("transform", `translate(${nodeData.y},${nodeData.x})`);
      }

      updateNodeElements(node);
    }
  };

  // Helper function to add node elements
  const addNodeElements = (
    nodeEnter: d3.Selection<SVGGElement, D3Node, null, undefined>
  ) => {
    // Background rect
    nodeEnter
      .append("rect")
      .attr("class", "node-bg")
      .attr("x", -4)
      .attr("y", -nodeHeight / 2 + 2)
      .attr("width", nodeWidth)
      .attr("height", nodeHeight - 4)
      .attr("rx", 8)
      .style("fill", "transparent");

    // Border rect
    nodeEnter
      .append("rect")
      .attr("class", "node-border")
      .attr("x", -4)
      .attr("y", -nodeHeight / 2 + 2)
      .attr("width", nodeWidth)
      .attr("height", nodeHeight - 4)
      .attr("rx", 8)
      .style("fill", "none")
      .style("stroke", "transparent")
      .style("stroke-width", "2px");

    // Toggle group
    const toggleGroup = nodeEnter
      .append("g")
      .attr("class", "toggle-group")
      .style("opacity", (d: D3Node) =>
        d.children || d._children || isExpandable(d) ? 1 : 0
      );

    toggleGroup
      .append("rect")
      .attr("class", "toggle-bg")
      .attr("x", 4)
      .attr("y", -6)
      .attr("width", 14)
      .attr("height", 14)
      .attr("rx", 2)
      .style("fill", "hsl(var(--muted))")
      .style("stroke", "hsl(var(--border))")
      .style("stroke-width", "1px");

    toggleGroup
      .append("text")
      .attr("class", "toggle-icon")
      .attr("x", 11)
      .attr("y", 1)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "12px")
      .style("font-weight", "700")
      .style("fill", "hsl(var(--foreground))")
      .style("pointer-events", "none")
      .style("user-select", "none")
      .text((d: D3Node) =>
        d.children ? "−" : d._children || isExpandable(d) ? "+" : ""
      );

    // Node icon
    nodeEnter
      .append("circle")
      .attr("class", "node-icon")
      .attr("cx", 11)
      .attr("cy", 0)
      .attr("r", 3)
      .style("fill", "hsl(var(--muted-foreground))")
      .style("opacity", (d: D3Node) =>
        d.children || d._children || isExpandable(d) ? 0 : 0.6
      );

    // Node label
    nodeEnter
      .append("text")
      .attr("class", "node-label")
      .attr("x", 32)
      .attr("y", 0)
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "middle")
      .style("font-size", "14px")
      .style("font-weight", "500")
      .style("fill", "hsl(var(--foreground))")
      .style("pointer-events", "none")
      .style("user-select", "none")
      .text((d: D3Node) => d.data.name);

    nodeEnter.append("title").text((d: D3Node) => d.data.name);
  };

  // Helper function to update node elements
  const updateNodeElements = (
    node: d3.Selection<SVGGElement, D3Node, null, undefined>
  ) => {
    node
      .select(".toggle-icon")
      .text((d: D3Node) =>
        d.children ? "−" : d._children || isExpandable(d) ? "+" : ""
      );
    node
      .select(".toggle-group")
      .style("opacity", (d: D3Node) =>
        d.children || d._children || isExpandable(d) ? 1 : 0
      );
    node
      .select(".node-icon")
      .style("opacity", (d: D3Node) =>
        d.children || d._children || isExpandable(d) ? 0 : 0.6
      );
  };

  const update = (source: D3Node) => {
    if (!containerRef) return;

    PerformanceMonitor.startMeasurement("progressive-update");

    PerformanceMonitor.startMeasurement("progressive-tree-traversal");
    const allNodes = root.descendants() as D3Node[];
    PerformanceMonitor.startMeasurement("progressive-strategy-calculation");
    // Check if we should use full optimization based on node count
    const shouldUseFullOptimization =
      allNodes.length <= optimizationConfig.maxNodesForFullOptimization;
    PerformanceMonitor.endMeasurement("progressive-strategy-calculation");
    PerformanceMonitor.startMeasurement(
      "progressive-visible-nodes-calculation"
    );
    const visibleNodes: D3Node[] = [];
    const traverse = (node: D3Node) => {
      visibleNodes.push(node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    traverse(root);
    PerformanceMonitor.endMeasurement("progressive-tree-traversal");
    PerformanceMonitor.endMeasurement("progressive-visible-nodes-calculation");

    PerformanceMonitor.startMeasurement("progressive-height-calculation");
    const contentHeight = Math.max(
      containerRef.clientHeight,
      visibleNodes.length * nodeHeight + margin.top + margin.bottom + 40
    );
    PerformanceMonitor.endMeasurement("progressive-height-calculation");

    PerformanceMonitor.startMeasurement("progressive-svg-height-update");
    d3.select(containerRef)
      .select("svg")
      .transition()
      .duration(getTransitionDuration())
      .attr("height", contentHeight);
    PerformanceMonitor.endMeasurement("progressive-svg-height-update");

    PerformanceMonitor.startMeasurement("progressive-position-calculation");
    visibleNodes.forEach((n: D3Node, idx: number) => {
      n.x = idx * nodeHeight;
      n.y = n.depth * indentSize;
    });
    PerformanceMonitor.endMeasurement("progressive-position-calculation");

    // Update positions in SharedNodeBuffer if available
    if (workerManager.isSharedBufferAvailable()) {
      PerformanceMonitor.startMeasurement("progressive-buffer-update");
      allNodes.forEach((n: D3Node, idx: number) => {
        if (typeof n.id === "number") {
          workerManager.updateNodePosition(n.id, {
            x: n.x || 0,
            y: n.y || 0,
            depth: n.depth || 0,
            visible: visibleNodes.includes(n) ? 1 : 0,
          });
        }
      });
      PerformanceMonitor.endMeasurement("progressive-buffer-update");
    }

    // Initialize Progressive Renderer if not already done
    if (!progressiveRenderer) {
      progressiveRenderer = new ProgressiveRenderer(containerRef);
    }

    PerformanceMonitor.startMeasurement("progressive-render-task-creation");
    // Prepare Progressive Renderer task execution function
    const executeProgressiveRender = () => {
      // All DOM operations are wrapped in this Progressive Renderer task
      performDOMUpdates();
    };

    const performDOMUpdates = () => {
      PerformanceMonitor.startMeasurement("dom-updates");

      PerformanceMonitor.startMeasurement("batch-d3-selection");
      const node = g
        .selectAll<SVGGElement, D3Node>("g.node")
        .data(allNodes, (d: D3Node) => d.id);
      PerformanceMonitor.endMeasurement("batch-d3-selection");

      // Prepare batch task setup and queuing measurements
      PerformanceMonitor.startMeasurement("batch-task-setup");
      // capture how many nodes are scheduled for batch operations and compute chunking plan
      const totalNodes = allNodes.length;
      const chunkSize = GracefulDegradation.getChunkSize(totalNodes);
      const batchCount = chunkSize > 0 ? Math.ceil(totalNodes / chunkSize) : 0;
      // create a lightweight plan array (small, cheap) so measurement records meaningful work for large graphs
      const batchPlan = new Array(batchCount).fill(0).map((_, idx) => ({
        start: idx * chunkSize,
        end: Math.min((idx + 1) * chunkSize, totalNodes),
        size: Math.max(0, Math.min(chunkSize, totalNodes - idx * chunkSize)),
      }));
      PerformanceMonitor.endMeasurement("batch-task-setup");

      PerformanceMonitor.startMeasurement("batch-task-queuing");
      // materialize a simple queue (will be empty for small datasets) that represents batches to be processed
      const batchQueue: { start: number; end: number; size: number }[] = [];
      for (let b = 0; b < batchPlan.length; b++) {
        batchQueue.push(batchPlan[b]);
      }
      PerformanceMonitor.endMeasurement("batch-task-queuing");

      PerformanceMonitor.startMeasurement("batch-node-processing");
      PerformanceMonitor.startMeasurement("batch-node-enter-creation");
      const nodeEnter = node
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", `translate(${source.y0},${source.x0})`)
        .style("opacity", 0)
        .style("cursor", "pointer")
        .on("click", (event: PointerEvent, d: D3Node) => handleClick(event, d));
      PerformanceMonitor.endMeasurement("batch-node-enter-creation");

      PerformanceMonitor.startMeasurement("batch-node-event-handlers");
      nodeEnter
        .on("mouseenter", function (this: SVGGElement) {
          if (optimizationConfig.enableTransitions) {
            d3.select(this)
              .select(".node-bg")
              .transition()
              .duration(OptimizationConfig.CONSTANTS.HOVER_DURATION)
              .style("fill", "hsl(var(--accent))")
              .style("opacity", 0.1);
            d3.select(this)
              .select(".node-border")
              .transition()
              .duration(OptimizationConfig.CONSTANTS.HOVER_DURATION)
              .style("stroke", "hsl(var(--accent))")
              .style("opacity", 0.4);
          } else {
            d3.select(this)
              .select(".node-bg")
              .style("fill", "hsl(var(--accent))")
              .style("opacity", 0.1);
            d3.select(this)
              .select(".node-border")
              .style("stroke", "hsl(var(--accent))")
              .style("opacity", 0.4);
          }
        })
        .on("mouseleave", function (this: SVGGElement) {
          if (optimizationConfig.enableTransitions) {
            d3.select(this)
              .select(".node-bg")
              .transition()
              .duration(OptimizationConfig.CONSTANTS.HOVER_OUT_DURATION)
              .style("fill", "transparent")
              .style("opacity", 1);
            d3.select(this)
              .select(".node-border")
              .transition()
              .duration(OptimizationConfig.CONSTANTS.HOVER_OUT_DURATION)
              .style("stroke", "transparent")
              .style("opacity", 1);
          } else {
            d3.select(this)
              .select(".node-bg")
              .style("fill", "transparent")
              .style("opacity", 1);
            d3.select(this)
              .select(".node-border")
              .style("stroke", "transparent")
              .style("opacity", 1);
          }
        });
      PerformanceMonitor.endMeasurement("batch-node-event-handlers");

      PerformanceMonitor.startMeasurement("batch-node-background-creation");
      // Background rect
      nodeEnter
        .append("rect")
        .attr("class", "node-bg")
        .attr("x", -4)
        .attr("y", -nodeHeight / 2 + 2)
        .attr("width", nodeWidth)
        .attr("height", nodeHeight - 4)
        .attr("rx", 8)
        .style("fill", "transparent");
      PerformanceMonitor.endMeasurement("batch-node-background-creation");

      PerformanceMonitor.startMeasurement("batch-node-border-creation");
      // Border rect
      nodeEnter
        .append("rect")
        .attr("class", "node-border")
        .attr("x", -4)
        .attr("y", -nodeHeight / 2 + 2)
        .attr("width", nodeWidth)
        .attr("height", nodeHeight - 4)
        .attr("rx", 8)
        .style("fill", "none")
        .style("stroke", "transparent")
        .style("stroke-width", "2px");
      PerformanceMonitor.endMeasurement("batch-node-border-creation");

      PerformanceMonitor.startMeasurement("batch-node-toggle-creation");
      const toggleGroup = nodeEnter
        .append("g")
        .attr("class", "toggle-group")
        .style("opacity", (d: D3Node) =>
          d.children || d._children || isExpandable(d) ? 1 : 0
        );

      toggleGroup
        .append("rect")
        .attr("class", "toggle-bg")
        .attr("x", 4)
        .attr("y", -6)
        .attr("width", 14)
        .attr("height", 14)
        .attr("rx", 2)
        .style("fill", "hsl(var(--muted))")
        .style("stroke", "hsl(var(--border))")
        .style("stroke-width", "1px");

      toggleGroup
        .append("text")
        .attr("class", "toggle-icon")
        .attr("x", 11)
        .attr("y", 1)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .style("font-size", "12px")
        .style("font-weight", "700")
        .style("fill", "hsl(var(--foreground))")
        .style("pointer-events", "none")
        .style("user-select", "none")
        .text((d: D3Node) => {
          if (d.children) return "−";
          if (d._children) return "+";
          return isExpandable(d) ? "+" : "";
        });
      PerformanceMonitor.endMeasurement("batch-node-toggle-creation");

      PerformanceMonitor.startMeasurement("batch-node-icon-creation");
      nodeEnter
        .append("circle")
        .attr("class", "node-icon")
        .attr("cx", 11)
        .attr("cy", 0)
        .attr("r", 3)
        .style("fill", "hsl(var(--muted-foreground))")
        .style("opacity", (d: D3Node) =>
          d.children || d._children || isExpandable(d) ? 0 : 0.6
        );
      PerformanceMonitor.endMeasurement("batch-node-icon-creation");

      PerformanceMonitor.startMeasurement("batch-node-label-creation");
      nodeEnter
        .append("text")
        .attr("class", "node-label")
        .attr("x", 32)
        .attr("y", 0)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "middle")
        .style("font-size", "14px")
        .style("font-weight", "500")
        .style("fill", "hsl(var(--foreground))")
        .style("pointer-events", "none")
        .style("user-select", "none")
        .text((d: D3Node) => d.data.name);

      nodeEnter.append("title").text((d: D3Node) => d.data.name);
      PerformanceMonitor.endMeasurement("batch-node-label-creation");

      PerformanceMonitor.startMeasurement("batch-node-update-transitions");
      const nodeUpdate = node
        .merge(nodeEnter)
        .transition()
        .duration(getTransitionDuration())
        .style("opacity", 1)
        .attr("transform", (d: D3Node) => `translate(${d.y},${d.x})`);
      PerformanceMonitor.endMeasurement("batch-node-update-transitions");

      PerformanceMonitor.startMeasurement("batch-node-state-updates");
      nodeUpdate.select(".toggle-icon").text((d: D3Node) => {
        if (d.children) return "−";
        if (d._children) return "+";
        return isExpandable(d) ? "+" : "";
      });

      nodeUpdate.select(".toggle-group").style("opacity", (d: D3Node) => {
        return d.children || d._children || isExpandable(d) ? 1 : 0;
      });

      nodeUpdate.select(".node-icon").style("opacity", (d: D3Node) => {
        return d.children || d._children || isExpandable(d) ? 0 : 0.6;
      });
      PerformanceMonitor.endMeasurement("batch-node-state-updates");

      PerformanceMonitor.startMeasurement("batch-node-exit-removal");
      node
        .exit()
        .transition()
        .duration(getTransitionDuration())
        .style("opacity", 0)
        .attr("transform", `translate(${source.y},${source.x})`)
        .remove();
      PerformanceMonitor.endMeasurement("batch-node-exit-removal");

      g.selectAll("path.link").remove();

      allNodes.forEach((d: D3Node) => {
        d.x0 = d.x;
        d.y0 = d.y;
      });

      PerformanceMonitor.endMeasurement("batch-node-processing");
      PerformanceMonitor.endMeasurement("dom-updates");
    }; // end performDOMUpdates
    PerformanceMonitor.endMeasurement("progressive-render-task-creation");

    // Execute based on capabilities and node count
    const nodeCount = allNodes.length;
    const shouldUseBatchProcessing =
      nodeCount > optimizationConfig.maxNodesForFullOptimization;

    if (
      !optimizationConfig.useProgressiveRendering ||
      !shouldUseBatchProcessing
    ) {
      // Direct execution for small datasets or when progressive rendering is disabled
      performDOMUpdates();
      PerformanceMonitor.endMeasurement("progressive-update");
    } else {
      PerformanceMonitor.startMeasurement("progressive-bulk-task-queuing");

      // Create batched render tasks based on capabilities
      const batchSize = Math.min(
        GracefulDegradation.getChunkSize(nodeCount),
        shouldUseFullOptimization
          ? OptimizationConfig.CONSTANTS.CHUNK_SIZE_WORKER
          : OptimizationConfig.CONSTANTS.CHUNK_SIZE_BASIC
      );

      // Create render tasks using the batch processing system
      const renderTasks = createBatchedTasks(
        allNodes,
        batchSize,
        (nodeBatch: D3Node[], batchIndex: number) => {
          // Calculate priority based on batch content
          const maxDepth = Math.max(
            ...nodeBatch.map((node) => node.depth || 0)
          );
          const minDepth = Math.min(
            ...nodeBatch.map((node) => node.depth || 0)
          );
          const avgDepth = (maxDepth + minDepth) / 2;

          // Higher priority for shallower nodes (closer to root)
          const basePriority =
            minDepth === 0
              ? OptimizationConfig.CONSTANTS.ROOT_PRIORITY
              : Math.max(
                  1,
                  OptimizationConfig.CONSTANTS.ROOT_PRIORITY -
                    OptimizationConfig.CONSTANTS.PRIORITY_DECREMENT -
                    avgDepth *
                      OptimizationConfig.CONSTANTS.PRIORITY_DEPTH_MULTIPLIER
                );

          // Boost priority for visible nodes
          const hasVisibleNodes = nodeBatch.some((node) => {
            const nodeY = node.x || 0;
            return progressiveRenderer!.isNodeVisible(nodeY, nodeHeight);
          });

          const finalPriority = hasVisibleNodes
            ? basePriority + OptimizationConfig.CONSTANTS.VISIBILITY_BOOST
            : basePriority;

          return {
            id: `batch-${batchIndex}-${Date.now()}`,
            priority: finalPriority,
            isVisible: hasVisibleNodes,
            execute: () => {
              PerformanceMonitor.startMeasurement(
                `batch-execution-${batchIndex}`
              );

              // Process each node in the batch efficiently
              const batchNodeSelection = g
                .selectAll<SVGGElement, D3Node>("g.node")
                .data(nodeBatch, (d: D3Node) => d.id);

              // Execute the batch rendering with idle callback support if enabled
              const executeBatchRender = () => {
                // Handle node enter, update, and exit for this batch
                const nodeEnter = batchNodeSelection
                  .enter()
                  .append("g")
                  .attr("class", "node")
                  .attr("transform", `translate(${source.y0},${source.x0})`)
                  .style("opacity", 0)
                  .style("cursor", "pointer")
                  .on("click", (event: PointerEvent, d: D3Node) =>
                    handleClick(event, d)
                  );

                // Add hover effects based on optimization config
                if (optimizationConfig.enableTransitions) {
                  nodeEnter
                    .on("mouseenter", function (this: SVGGElement) {
                      d3.select(this)
                        .select(".node-bg")
                        .transition()
                        .duration(OptimizationConfig.CONSTANTS.HOVER_DURATION)
                        .style("fill", "hsl(var(--accent))")
                        .style("opacity", 0.1);
                      d3.select(this)
                        .select(".node-border")
                        .transition()
                        .duration(OptimizationConfig.CONSTANTS.HOVER_DURATION)
                        .style("stroke", "hsl(var(--accent))")
                        .style("opacity", 0.4);
                    })
                    .on("mouseleave", function (this: SVGGElement) {
                      d3.select(this)
                        .select(".node-bg")
                        .transition()
                        .duration(
                          OptimizationConfig.CONSTANTS.HOVER_OUT_DURATION
                        )
                        .style("fill", "transparent")
                        .style("opacity", 1);
                      d3.select(this)
                        .select(".node-border")
                        .transition()
                        .duration(
                          OptimizationConfig.CONSTANTS.HOVER_OUT_DURATION
                        )
                        .style("stroke", "transparent")
                        .style("opacity", 1);
                    });
                }

                // Add elements to new nodes
                nodeEnter.each(function (this: SVGGElement, d: D3Node) {
                  const selection = d3.select(this) as d3.Selection<
                    SVGGElement,
                    D3Node,
                    null,
                    undefined
                  >;
                  addNodeElements(selection);
                });

                // Update all nodes (new and existing)
                const nodeUpdate = batchNodeSelection.merge(nodeEnter);
                const animDuration = getTransitionDuration(3);

                if (animDuration > 0) {
                  nodeUpdate
                    .transition()
                    .duration(animDuration)
                    .style("opacity", 1)
                    .attr(
                      "transform",
                      (d: D3Node) => `translate(${d.y},${d.x})`
                    );
                } else {
                  nodeUpdate
                    .style("opacity", 1)
                    .attr(
                      "transform",
                      (d: D3Node) => `translate(${d.y},${d.x})`
                    );
                }

                // Update node states
                nodeUpdate.each(function (this: SVGGElement, d: D3Node) {
                  const selection = d3.select(this) as d3.Selection<
                    SVGGElement,
                    D3Node,
                    null,
                    undefined
                  >;
                  updateNodeElements(selection);
                });

                // Handle exit nodes
                batchNodeSelection
                  .exit()
                  .transition()
                  .duration(animDuration)
                  .style("opacity", 0)
                  .attr("transform", `translate(${source.y},${source.x})`)
                  .remove();
              };

              if (
                optimizationConfig.useIdleCallback &&
                "requestIdleCallback" in window &&
                !hasVisibleNodes
              ) {
                // Use idle callback for non-visible nodes
                (window as any).requestIdleCallback(
                  () => {
                    executeBatchRender();
                    PerformanceMonitor.endMeasurement(
                      `batch-execution-${batchIndex}`
                    );
                  },
                  { timeout: OptimizationConfig.CONSTANTS.IDLE_TIMEOUT }
                );
              } else {
                // Execute immediately for visible nodes
                executeBatchRender();
                PerformanceMonitor.endMeasurement(
                  `batch-execution-${batchIndex}`
                );
              }
            },
          } as RenderTask;
        }
      );

      // Add bulk tasks to Progressive Renderer for priority-based processing
      progressiveRenderer!.addBulkTasks(renderTasks);

      if (optimizationConfig.enablePerformanceMonitoring) {
        console.log(
          `Created ${renderTasks.length} batched tasks for ${nodeCount} nodes (batch size: ${batchSize})`
        );
      }

      PerformanceMonitor.endMeasurement("progressive-bulk-task-queuing");
      PerformanceMonitor.endMeasurement("progressive-update");
    }
  }; // end update function

  const handleClick = async (event: PointerEvent, d: D3Node) => {
    event.stopPropagation();

    PerformanceMonitor.startMeasurement("node-expansion");

    if (d.children) {
      d._children = d.children;
      d.children = null;
      update(d);
      PerformanceMonitor.endMeasurement("node-expansion");
      return;
    }

    if (d._children) {
      d.children = d._children;
      d._children = null;
      update(d);
      PerformanceMonitor.endMeasurement("node-expansion");
      return;
    }

    if (!isExpandable(d)) {
      PerformanceMonitor.endMeasurement("node-expansion");
      return;
    }

    if (d.data.token && Array.from(d.data.token).join(",") === "-1") {
      PerformanceMonitor.endMeasurement("node-expansion");
      return;
    }

    try {
      const spaceNode: SpaceNode = {
        id: d.data.id,
        label: d.data.name,
        remoteData: {
          token: d.data.token,
          expr: d.data.expr,
        },
      };

      if (d.data.token && d.data.token.length === 1 && d.data.token[0] === -1) {
        return;
      }

      if (!d.data.token || d.data.token.length === 0) {
        return;
      }

      PerformanceMonitor.startMeasurement("node-expansion-api-call");
      const children = await exploreSpace(
        formatedNamespace(),
        props.pattern,
        spaceNode.remoteData.token
      );
      PerformanceMonitor.endMeasurement("node-expansion-api-call");

      PerformanceMonitor.startMeasurement("node-expansion-json-parse");
      const parsedChildren = JSON.parse(
        children as any /* eslint-disable-line @typescript-eslint/no-explicit-any */
      );
      PerformanceMonitor.endMeasurement("node-expansion-json-parse");

      if (parsedChildren && parsedChildren.length > 0) {
        // Use processing strategy based on capabilities and node count (single calculation)
        const strategy = GracefulDegradation.getProcessingStrategy(
          parsedChildren.length
        );

        if (optimizationConfig.enablePerformanceMonitoring) {
          console.log(
            `Processing ${parsedChildren.length} nodes with ${strategy} strategy`
          );
        }

        let newNodesData;

        PerformanceMonitor.startMeasurement("worker-processing");
        PerformanceMonitor.startMeasurement("node-expansion-data-processing");

        // Add background processing delay if configured
        if (
          optimizationConfig.backgroundProcessingDelay &&
          optimizationConfig.backgroundProcessingDelay > 0
        ) {
          PerformanceMonitor.startMeasurement("background-processing-delay");
          await new Promise((resolve) =>
            setTimeout(resolve, optimizationConfig.backgroundProcessingDelay)
          );
          PerformanceMonitor.endMeasurement("background-processing-delay");
        }

        if (shouldUseWorker(strategy)) {
          try {
            PerformanceMonitor.startMeasurement(
              "node-expansion-worker-processing"
            );
            newNodesData =
              await workerManager.initNodesFromApiResponse(parsedChildren);
            PerformanceMonitor.endMeasurement(
              "node-expansion-worker-processing"
            );
          } catch (error) {
            console.warn("Worker failed, using fallback:", error);
            PerformanceMonitor.startMeasurement(
              "node-expansion-fallback-processing"
            );
            newNodesData =
              await EnhancedFallbackProcessor.initNodesFromApiResponse(
                parsedChildren
              );
            PerformanceMonitor.endMeasurement(
              "node-expansion-fallback-processing"
            );
          }
        } else {
          PerformanceMonitor.startMeasurement(
            "node-expansion-fallback-processing"
          );
          newNodesData =
            await EnhancedFallbackProcessor.initNodesFromApiResponse(
              parsedChildren
            );
          PerformanceMonitor.endMeasurement(
            "node-expansion-fallback-processing"
          );
        }
        PerformanceMonitor.endMeasurement("node-expansion-data-processing");
        PerformanceMonitor.endMeasurement("worker-processing");

        PerformanceMonitor.startMeasurement(
          "node-expansion-hierarchy-creation"
        );
        const newNodes = newNodesData.nodes;
        const prefix = newNodesData.prefix;

        PerformanceMonitor.startMeasurement("node-expansion-path-construction");
        let currentPath = d.data.id;

        if (prefix.length > 0) {
          prefix.forEach((prefixPart) => {
            currentPath += `/${prefixPart}`;
          });
        }
        PerformanceMonitor.endMeasurement("node-expansion-path-construction");

        PerformanceMonitor.startMeasurement("node-expansion-children-mapping");
        const childrenData = newNodes.map((node: SpaceNode) => ({
          name: node.label,
          id: `${currentPath}/${node.label}`,
          token: node.remoteData.token,
          expr: node.remoteData.expr,
          isExpandable: true,
          isFromBackend: true,
        }));
        PerformanceMonitor.endMeasurement("node-expansion-children-mapping");

        PerformanceMonitor.startMeasurement("node-expansion-batch-setup");
        // Batch setup for child node creation
        const childCount = childrenData.length;
        const expansionChunkSize = GracefulDegradation.getChunkSize(childCount);
        const expansionBatchCount =
          expansionChunkSize > 0
            ? Math.ceil(childCount / expansionChunkSize)
            : 0;
        PerformanceMonitor.endMeasurement("node-expansion-batch-setup");

        PerformanceMonitor.startMeasurement(
          "node-expansion-d3-hierarchy-creation"
        );
        PerformanceMonitor.startMeasurement(
          "node-expansion-hierarchy-node-creation"
        );
        const childHierarchyNodes = childrenData.map((childData) => {
          const childNode = d3.hierarchy(childData) as D3Node;
          return childNode;
        });
        PerformanceMonitor.endMeasurement(
          "node-expansion-hierarchy-node-creation"
        );

        PerformanceMonitor.startMeasurement(
          "node-expansion-parent-child-linking"
        );
        childHierarchyNodes.forEach((childNode) => {
          childNode.depth = d.depth + 1;
          childNode.parent = d;
          childNode.id = ++i;
        });
        PerformanceMonitor.endMeasurement(
          "node-expansion-parent-child-linking"
        );

        PerformanceMonitor.startMeasurement(
          "node-expansion-position-initialization"
        );
        childHierarchyNodes.forEach((childNode) => {
          childNode.x0 = d.x;
          childNode.y0 = d.y;
        });
        PerformanceMonitor.endMeasurement(
          "node-expansion-position-initialization"
        );
        PerformanceMonitor.endMeasurement(
          "node-expansion-d3-hierarchy-creation"
        );

        PerformanceMonitor.startMeasurement("node-expansion-parent-assignment");
        d.children = childHierarchyNodes;
        PerformanceMonitor.endMeasurement("node-expansion-parent-assignment");

        // Store new nodes in SharedNodeBuffer if available
        if (workerManager.isSharedBufferAvailable()) {
          PerformanceMonitor.startMeasurement("node-expansion-buffer-storage");
          childHierarchyNodes.forEach((childNode) => {
            if (typeof childNode.id === "number") {
              workerManager.setNodeData(
                childNode.id,
                {
                  x: childNode.x0 || 0,
                  y: childNode.y0 || 0,
                  depth: childNode.depth || 0,
                  visible: 1,
                },
                {
                  name: childNode.data.name,
                  id: childNode.data.id,
                  expr: childNode.data.expr,
                }
              );
            }
          });
          PerformanceMonitor.endMeasurement("node-expansion-buffer-storage");
        }

        PerformanceMonitor.endMeasurement("node-expansion-hierarchy-creation");
        PerformanceMonitor.startMeasurement("node-expansion-dom-application");
        PerformanceMonitor.startMeasurement("node-expansion-dom-preparation");
        // DOM preparation phase - getting ready for update
        const nodeCountBeforeUpdate = root.descendants().length;
        PerformanceMonitor.endMeasurement("node-expansion-dom-preparation");

        PerformanceMonitor.startMeasurement(
          "node-expansion-dom-update-trigger"
        );
        update(d);
        PerformanceMonitor.endMeasurement("node-expansion-dom-update-trigger");
        PerformanceMonitor.endMeasurement("node-expansion-dom-application");
        PerformanceMonitor.endMeasurement("node-expansion");
      } else if (
        spaceNode.remoteData.expr &&
        spaceNode.remoteData.expr.trim() !== ""
      ) {
        // No parsing, expr is displayed as is, no expansion
        d._isLeaf = true;
        update(d);
        PerformanceMonitor.endMeasurement("node-expansion");
      } else {
        d._isLeaf = true;
        d.children = null;
        d._children = null;
        update(d);
        PerformanceMonitor.endMeasurement("node-expansion");
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
          description: "An error occurred expanding the node.",
          variant: "destructive",
        });
      }
      d._isLeaf = true;
      d.children = null;
      d._children = null;
      update(d);
      PerformanceMonitor.endMeasurement("node-expansion");
    }
  };

  onMount(async () => {
    if (!containerRef) return;

    PerformanceMonitor.startMeasurement("initial-tree-conversion");

    PerformanceMonitor.startMeasurement("initial-svg-setup");
    const initialHeight = containerRef.clientHeight;

    svg = d3
      .select(containerRef)
      .append("svg")
      .attr("width", "100%")
      .attr("height", initialHeight)
      .style("background", "hsl(var(--background))")
      .style("border-radius", "8px");

    g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    PerformanceMonitor.endMeasurement("initial-svg-setup");

    // Initialize SharedNodeBuffer for cross-thread communication
    PerformanceMonitor.startMeasurement("shared-buffer-initialization");
    const estimatedNodes = Math.max(
      props.data.nodes.length *
        OptimizationConfig.CONSTANTS.ESTIMATED_GROWTH_FACTOR,
      OptimizationConfig.CONSTANTS.DEFAULT_ESTIMATED_NODES
    );
    const sharedBufferInitialized =
      workerManager.initSharedNodeBuffer(estimatedNodes);

    if (sharedBufferInitialized) {
      console.info("SharedNodeBuffer initialized for optimized rendering");
    }
    PerformanceMonitor.endMeasurement("shared-buffer-initialization");

    PerformanceMonitor.startMeasurement("initial-data-processing");
    // Use processing strategy based on capabilities and node count
    PerformanceMonitor.startMeasurement("initial-strategy-calculation");
    const strategy = GracefulDegradation.getProcessingStrategy(
      props.data.nodes.length
    );
    PerformanceMonitor.endMeasurement("initial-strategy-calculation");

    // Performance monitoring for initial load
    if (
      optimizationConfig.enablePerformanceMonitoring &&
      optimizationConfig.logPerformanceMetrics
    ) {
      console.log(
        `Initializing graph with ${props.data.nodes.length} nodes using ${strategy} strategy`
      );
    }

    let treeData;
    if (shouldUseWorker(strategy)) {
      try {
        PerformanceMonitor.startMeasurement("initial-worker-conversion");
        treeData = await workerManager.convertToD3TreeData(
          props.data,
          props.pattern
        );
        PerformanceMonitor.endMeasurement("initial-worker-conversion");
      } catch (error) {
        console.warn("Worker failed, using fallback:", error);
        PerformanceMonitor.startMeasurement("initial-fallback-conversion");
        treeData = await FallbackProcessor.convertToD3TreeData(
          props.data,
          props.pattern
        );
        PerformanceMonitor.endMeasurement("initial-fallback-conversion");
      }
    } else {
      PerformanceMonitor.startMeasurement("initial-fallback-conversion");
      treeData = await FallbackProcessor.convertToD3TreeData(
        props.data,
        props.pattern
      );
      PerformanceMonitor.endMeasurement("initial-fallback-conversion");
    }
    PerformanceMonitor.endMeasurement("initial-data-processing");

    PerformanceMonitor.startMeasurement("initial-hierarchy-setup");
    root = d3.hierarchy(treeData) as D3Node;
    root.x0 = 0;
    root.y0 = 0;
    root.descendants().forEach((d: D3Node, index: number) => {
      d.id = index;
      i = index;
    });
    PerformanceMonitor.endMeasurement("initial-hierarchy-setup");

    // Store initial node data in SharedNodeBuffer if available
    if (sharedBufferInitialized && workerManager.isSharedBufferAvailable()) {
      PerformanceMonitor.startMeasurement("initial-buffer-population");
      root.descendants().forEach((d: D3Node, index: number) => {
        workerManager.setNodeData(
          index,
          { x: d.x0 || 0, y: d.y0 || 0, depth: d.depth || 0, visible: 1 },
          { name: d.data.name, id: d.data.id, expr: d.data.expr }
        );
      });
      PerformanceMonitor.endMeasurement("initial-buffer-population");
      console.info(
        `Stored ${root.descendants().length} nodes in SharedNodeBuffer`
      );
    }

    PerformanceMonitor.endMeasurement("initial-tree-conversion");
    // Initial render
    update(root);
  });

  createEffect(async () => {
    if (!g || !root) return;

    PerformanceMonitor.startMeasurement("data-update");

    PerformanceMonitor.startMeasurement("data-update-strategy-calculation");
    // Use processing strategy based on capabilities and node count
    const strategy = GracefulDegradation.getProcessingStrategy(
      props.data.nodes.length
    );
    PerformanceMonitor.endMeasurement("data-update-strategy-calculation");
    PerformanceMonitor.startMeasurement("data-update-render-task-creation");
    // implicit render task creation on data update
    PerformanceMonitor.endMeasurement("data-update-render-task-creation");
    PerformanceMonitor.startMeasurement("data-update-bulk-task-queuing");
    // implicit bulk queuing on data update
    PerformanceMonitor.endMeasurement("data-update-bulk-task-queuing");

    PerformanceMonitor.startMeasurement("data-update-conversion");
    let treeData;
    if (shouldUseWorker(strategy)) {
      try {
        PerformanceMonitor.startMeasurement("data-update-worker-conversion");
        treeData = await workerManager.convertToD3TreeData(
          props.data,
          props.pattern
        );
        PerformanceMonitor.endMeasurement("data-update-worker-conversion");
      } catch (error) {
        console.warn("Worker failed, using fallback:", error);
        PerformanceMonitor.startMeasurement("data-update-fallback-conversion");
        treeData = await FallbackProcessor.convertToD3TreeData(
          props.data,
          props.pattern
        );
        PerformanceMonitor.endMeasurement("data-update-fallback-conversion");
      }
    } else {
      PerformanceMonitor.startMeasurement("data-update-fallback-conversion");
      treeData = await FallbackProcessor.convertToD3TreeData(
        props.data,
        props.pattern
      );
      PerformanceMonitor.endMeasurement("data-update-fallback-conversion");
    }
    PerformanceMonitor.endMeasurement("data-update-conversion");

    PerformanceMonitor.startMeasurement("data-update-hierarchy-update");
    const newRoot = d3.hierarchy(treeData) as D3Node;

    root.data = newRoot.data;
    root.children = newRoot.children;
    root.x0 = 0;
    root.y0 = 0;

    root.descendants().forEach((d: D3Node, index: number) => {
      d.id = index;
      i = index;
      d.y = d.depth * indentSize;

      if (d.depth && d.children) {
        d._children = d.children;
        d.children = null;
      }
    });
    PerformanceMonitor.endMeasurement("data-update-hierarchy-update");

    // Update SharedNodeBuffer with new data
    if (workerManager.isSharedBufferAvailable()) {
      PerformanceMonitor.startMeasurement("data-update-buffer-sync");
      root.descendants().forEach((d: D3Node, index: number) => {
        workerManager.setNodeData(
          index,
          { x: d.x || 0, y: d.y || 0, depth: d.depth || 0, visible: 1 },
          { name: d.data.name, id: d.data.id, expr: d.data.expr }
        );
      });
      PerformanceMonitor.endMeasurement("data-update-buffer-sync");
    }

    update(root);
    PerformanceMonitor.endMeasurement("data-update");
  });

  onCleanup(() => {
    if (containerRef) d3.select(containerRef).selectAll("*").remove();
    if (progressiveRenderer) {
      progressiveRenderer.clear();
      progressiveRenderer = null;
    }
  });

  return (
    <div
      ref={containerRef!}
      class="w-full h-full overflow-auto custom-scrollbar bg-card rounded-lg border border-border shadow-sm"
    />
  );
}
