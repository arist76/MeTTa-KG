import { createSignal, onMount, onCleanup } from "solid-js";
import { PerformanceMonitor } from "~/lib/fallbackProcessor";
import { CapabilityDetector, OptimizationConfig } from "~/lib/capabilities";
import { getGraphWorkerManager } from "~/workers/workerManager";

interface PerformanceMetrics {
  nodeExpansion: { average: number; count: number };
  progressiveUpdate: { average: number; count: number };
  initialTreeConversion: { average: number; count: number };
  dataUpdate: { average: number; count: number };
  workerProcessing: { average: number; count: number };
  // Progressive Update Breakdown
  progressiveTreeTraversal: { average: number; count: number };
  progressiveStrategyCalculation: { average: number; count: number };
  progressiveVisibleNodesCalculation: { average: number; count: number };
  progressiveHeightCalculation: { average: number; count: number };
  progressiveSvgHeightUpdate: { average: number; count: number };
  progressivePositionCalculation: { average: number; count: number };
  progressiveRenderTaskCreation: { average: number; count: number };
  progressiveBulkTaskQueuing: { average: number; count: number };
  // New Batched Rendering Metrics
  progressiveBatchTaskSetup: { average: number; count: number };
  batchD3Selection: { average: number; count: number };
  batchNodeProcessing: { average: number; count: number };
  batchTaskSetup: { average: number; count: number };
  batchTaskQueuing: { average: number; count: number };
  // Node Expansion Breakdown
  nodeExpansionApiCall: { average: number; count: number };
  nodeExpansionJsonParse: { average: number; count: number };
  nodeExpansionDataProcessing: { average: number; count: number };
  nodeExpansionWorkerProcessing: { average: number; count: number };
  nodeExpansionFallbackProcessing: { average: number; count: number };
  nodeExpansionHierarchyCreation: { average: number; count: number };
  nodeExpansionPathConstruction: { average: number; count: number };
  nodeExpansionChildrenMapping: { average: number; count: number };
  nodeExpansionBatchSetup: { average: number; count: number };
  nodeExpansionHierarchyNodeCreation: { average: number; count: number };
  nodeExpansionParentChildLinking: { average: number; count: number };
  nodeExpansionPositionInitialization: { average: number; count: number };
  nodeExpansionParentAssignment: { average: number; count: number };
  nodeExpansionDomApplication: { average: number; count: number };
  nodeExpansionDomPreparation: { average: number; count: number };
  nodeExpansionDomUpdateTrigger: { average: number; count: number };
  // SharedArrayBuffer Metrics
  sharedBufferWrite: { average: number; count: number };
}

interface SystemInfo {
  workerSupport: boolean;
  sharedArrayBufferSupport: boolean;
  performanceAPISupport: boolean;
  requestIdleCallbackSupport: boolean;
  memoryInfo?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  sharedBufferInfo?: {
    allocatedSize: number;
    maxNodes: number;
    bytesPerNode: number;
    utilizationPercentage: number;
    stringBufferUsed: number;
    stringBufferSize: number;
    cachedStrings: number;
  };
}

export function PerformanceDashboard() {
  const [isVisible, setIsVisible] = createSignal(false);
  const [metrics, setMetrics] = createSignal<PerformanceMetrics>({
    nodeExpansion: { average: 0, count: 0 },
    progressiveUpdate: { average: 0, count: 0 },
    initialTreeConversion: { average: 0, count: 0 },
    dataUpdate: { average: 0, count: 0 },
    workerProcessing: { average: 0, count: 0 },
    // Progressive Update Breakdown
    progressiveTreeTraversal: { average: 0, count: 0 },
    progressiveStrategyCalculation: { average: 0, count: 0 },
    progressiveVisibleNodesCalculation: { average: 0, count: 0 },
    progressiveHeightCalculation: { average: 0, count: 0 },
    progressiveSvgHeightUpdate: { average: 0, count: 0 },
    progressivePositionCalculation: { average: 0, count: 0 },
    progressiveRenderTaskCreation: { average: 0, count: 0 },
    progressiveBulkTaskQueuing: { average: 0, count: 0 },
    // New Batched Rendering Metrics
    progressiveBatchTaskSetup: { average: 0, count: 0 },
    batchD3Selection: { average: 0, count: 0 },
    batchNodeProcessing: { average: 0, count: 0 },
    batchTaskSetup: { average: 0, count: 0 },
    batchTaskQueuing: { average: 0, count: 0 },
    // Node Expansion Breakdown
    nodeExpansionApiCall: { average: 0, count: 0 },
    nodeExpansionJsonParse: { average: 0, count: 0 },
    nodeExpansionDataProcessing: { average: 0, count: 0 },
    nodeExpansionWorkerProcessing: { average: 0, count: 0 },
    nodeExpansionFallbackProcessing: { average: 0, count: 0 },
    nodeExpansionHierarchyCreation: { average: 0, count: 0 },
    nodeExpansionPathConstruction: { average: 0, count: 0 },
    nodeExpansionChildrenMapping: { average: 0, count: 0 },
    nodeExpansionBatchSetup: { average: 0, count: 0 },
    nodeExpansionHierarchyNodeCreation: { average: 0, count: 0 },
    nodeExpansionParentChildLinking: { average: 0, count: 0 },
    nodeExpansionPositionInitialization: { average: 0, count: 0 },
    nodeExpansionParentAssignment: { average: 0, count: 0 },
    nodeExpansionDomApplication: { average: 0, count: 0 },
    nodeExpansionDomPreparation: { average: 0, count: 0 },
    nodeExpansionDomUpdateTrigger: { average: 0, count: 0 },
    // SharedArrayBuffer Metrics
    sharedBufferWrite: { average: 0, count: 0 },
  });
  const [systemInfo, setSystemInfo] = createSignal<SystemInfo>({
    workerSupport: false,
    sharedArrayBufferSupport: false,
    performanceAPISupport: false,
    requestIdleCallbackSupport: false,
  });

  let updateInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    // Update system info
    setSystemInfo({
      workerSupport: CapabilityDetector.workerSupport,
      sharedArrayBufferSupport: CapabilityDetector.sharedArrayBufferSupport,
      performanceAPISupport: CapabilityDetector.performanceAPISupport,
      requestIdleCallbackSupport: CapabilityDetector.requestIdleCallbackSupport,
      memoryInfo: getMemoryInfo(),
      sharedBufferInfo: getSharedBufferInfo(),
    });

    // Update metrics every 2 seconds
    updateInterval = setInterval(updateMetrics, 2000);
    updateMetrics(); // Initial update
  });

  onCleanup(() => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });

  const getMemoryInfo = () => {
    if ("memory" in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      };
    }
    return undefined;
  };

  const getSharedBufferInfo = () => {
    try {
      // Get the existing worker manager instance
      const workerManager = getGraphWorkerManager();

      if (!workerManager.isSharedArrayBufferAvailable()) {
        return undefined;
      }

      // Get buffer stats from the new SharedNodeBuffer
      const stats = workerManager.getBufferStats();
      if (!stats) {
        return undefined;
      }

      const views = workerManager.getNodeBufferViews();
      if (!views) {
        return undefined;
      }

      // Each node uses 10 floats (x, y, depth, visible, nameOffset, nameLength, idOffset, idLength, exprOffset, exprLength)
      const floatsPerNode = 10;
      const bytesPerNode = floatsPerNode * Float32Array.BYTES_PER_ELEMENT;
      const maxNodes = Math.floor(stats.nodeBufferSize / bytesPerNode);
      const allocatedSize = stats.nodeBufferSize + stats.stringBufferSize;

      // Calculate utilization based on initialized positions
      let usedNodes = 0;
      const nodeView = views.nodeView;
      for (let i = 0; i < nodeView.length; i += floatsPerNode) {
        // Check if this node slot has been initialized
        const x = nodeView[i];
        const y = nodeView[i + 1];
        const depth = nodeView[i + 2];
        const visible = nodeView[i + 3];

        if (x !== 0 || y !== 0 || depth !== 0 || visible !== 0) {
          usedNodes++;
        }
      }

      const utilizationPercentage =
        maxNodes > 0 ? (usedNodes / maxNodes) * 100 : 0;

      return {
        allocatedSize,
        maxNodes,
        bytesPerNode,
        utilizationPercentage,
        stringBufferUsed: stats.stringBufferUsed,
        stringBufferSize: stats.stringBufferSize,
        cachedStrings: stats.cachedStrings,
      };
    } catch (error) {
      console.warn("Failed to get SharedArrayBuffer info:", error);
      return undefined;
    }
  };

  const updateMetrics = () => {
    const allMeasurements = PerformanceMonitor.getAllMeasurements();

    setMetrics({
      nodeExpansion: allMeasurements["node-expansion"] || {
        average: 0,
        count: 0,
      },
      progressiveUpdate: allMeasurements["progressive-update"] || {
        average: 0,
        count: 0,
      },
      initialTreeConversion: allMeasurements["initial-tree-conversion"] || {
        average: 0,
        count: 0,
      },
      dataUpdate: allMeasurements["data-update"] || { average: 0, count: 0 },
      workerProcessing: allMeasurements["worker-processing"] || {
        average: 0,
        count: 0,
      },
      // Progressive Update Breakdown
      progressiveTreeTraversal: allMeasurements[
        "progressive-tree-traversal"
      ] || { average: 0, count: 0 },
      progressiveStrategyCalculation: allMeasurements[
        "progressive-strategy-calculation"
      ] || { average: 0, count: 0 },
      progressiveVisibleNodesCalculation: allMeasurements[
        "progressive-visible-nodes-calculation"
      ] || { average: 0, count: 0 },
      progressiveHeightCalculation: allMeasurements[
        "progressive-height-calculation"
      ] || { average: 0, count: 0 },
      progressiveSvgHeightUpdate: allMeasurements[
        "progressive-svg-height-update"
      ] || { average: 0, count: 0 },
      progressivePositionCalculation: allMeasurements[
        "progressive-position-calculation"
      ] || { average: 0, count: 0 },
      progressiveRenderTaskCreation: allMeasurements[
        "progressive-render-task-creation"
      ] || { average: 0, count: 0 },
      progressiveBulkTaskQueuing: allMeasurements[
        "progressive-bulk-task-queuing"
      ] || { average: 0, count: 0 },
      // New Batched Rendering Metrics
      progressiveBatchTaskSetup: allMeasurements[
        "progressive-batch-task-setup"
      ] || { average: 0, count: 0 },
      batchD3Selection: allMeasurements["batch-d3-selection"] || {
        average: 0,
        count: 0,
      },
      batchNodeProcessing: allMeasurements["batch-node-processing"] || {
        average: 0,
        count: 0,
      },
      batchTaskSetup: allMeasurements["batch-task-setup"] || {
        average: 0,
        count: 0,
      },
      batchTaskQueuing: allMeasurements["batch-task-queuing"] || {
        average: 0,
        count: 0,
      },
      // Node Expansion Breakdown
      nodeExpansionApiCall: allMeasurements["node-expansion-api-call"] || {
        average: 0,
        count: 0,
      },
      nodeExpansionJsonParse: allMeasurements["node-expansion-json-parse"] || {
        average: 0,
        count: 0,
      },
      nodeExpansionDataProcessing: allMeasurements[
        "node-expansion-data-processing"
      ] || { average: 0, count: 0 },
      nodeExpansionWorkerProcessing: allMeasurements[
        "node-expansion-worker-processing"
      ] || { average: 0, count: 0 },
      nodeExpansionFallbackProcessing: allMeasurements[
        "node-expansion-fallback-processing"
      ] || { average: 0, count: 0 },
      nodeExpansionHierarchyCreation: allMeasurements[
        "node-expansion-hierarchy-creation"
      ] || { average: 0, count: 0 },
      nodeExpansionPathConstruction: allMeasurements[
        "node-expansion-path-construction"
      ] || { average: 0, count: 0 },
      nodeExpansionChildrenMapping: allMeasurements[
        "node-expansion-children-mapping"
      ] || { average: 0, count: 0 },
      nodeExpansionBatchSetup: allMeasurements[
        "node-expansion-batch-setup"
      ] || { average: 0, count: 0 },
      nodeExpansionHierarchyNodeCreation: allMeasurements[
        "node-expansion-hierarchy-node-creation"
      ] || { average: 0, count: 0 },
      nodeExpansionParentChildLinking: allMeasurements[
        "node-expansion-parent-child-linking"
      ] || { average: 0, count: 0 },
      nodeExpansionPositionInitialization: allMeasurements[
        "node-expansion-position-initialization"
      ] || { average: 0, count: 0 },
      nodeExpansionParentAssignment: allMeasurements[
        "node-expansion-parent-assignment"
      ] || { average: 0, count: 0 },
      nodeExpansionDomApplication: allMeasurements[
        "node-expansion-dom-application"
      ] || { average: 0, count: 0 },
      nodeExpansionDomPreparation: allMeasurements[
        "node-expansion-dom-preparation"
      ] || { average: 0, count: 0 },
      nodeExpansionDomUpdateTrigger: allMeasurements[
        "node-expansion-dom-update-trigger"
      ] || { average: 0, count: 0 },
      // SharedArrayBuffer Metrics
      sharedBufferWrite: allMeasurements["shared-buffer-write"] || {
        average: 0,
        count: 0,
      },
    });

    // Update memory info if available
    const memory = getMemoryInfo();
    const sharedBuffer = getSharedBufferInfo();
    if (memory || sharedBuffer) {
      setSystemInfo((prev) => ({
        ...prev,
        memoryInfo: memory || prev.memoryInfo,
        sharedBufferInfo: sharedBuffer || prev.sharedBufferInfo,
      }));
    }
  };

  const formatMemory = (bytes: number) => {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatTime = (ms: number) => {
    return `${ms.toFixed(2)}ms`;
  };

  const getPerformanceStatus = (
    avgTime: number
  ): "good" | "warning" | "poor" => {
    if (avgTime < 50) return "good";
    if (avgTime < 200) return "warning";
    return "poor";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "good":
        return "text-green-600";
      case "warning":
        return "text-yellow-600";
      case "poor":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible())}
        class="fixed bottom-4 left-4 z-50 bg-background/80 backdrop-blur-sm border border-border rounded-lg p-2 hover:bg-accent/10 transition-colors"
        title="Performance Dashboard"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </button>

      {/* Performance Dashboard */}
      {isVisible() && (
        <div class="fixed bottom-16 left-4 z-50 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-4 w-96 max-h-96 overflow-y-auto">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold">Performance Dashboard</h3>
            <button
              onClick={() => setIsVisible(false)}
              class="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </div>

          {/* System Capabilities */}
          <div class="mb-4">
            <h4 class="font-medium mb-2">System Capabilities</h4>
            <div class="space-y-1 text-sm">
              <div class="flex justify-between">
                <span>Web Workers:</span>
                <span
                  class={
                    systemInfo().workerSupport
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {systemInfo().workerSupport ? "✓" : "✗"}
                </span>
              </div>
              <div class="flex justify-between">
                <span>SharedArrayBuffer:</span>
                <span
                  class={
                    systemInfo().sharedArrayBufferSupport
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {systemInfo().sharedArrayBufferSupport ? "✓" : "✗"}
                </span>
              </div>
              <div class="flex justify-between">
                <span>Performance API:</span>
                <span
                  class={
                    systemInfo().performanceAPISupport
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {systemInfo().performanceAPISupport ? "✓" : "✗"}
                </span>
              </div>
              <div class="flex justify-between">
                <span>Idle Callback:</span>
                <span
                  class={
                    systemInfo().requestIdleCallbackSupport
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {systemInfo().requestIdleCallbackSupport ? "✓" : "✗"}
                </span>
              </div>
            </div>
          </div>

          {/* Memory Usage */}
          {systemInfo().memoryInfo && (
            <div class="mb-4">
              <h4 class="font-medium mb-2">Memory Usage</h4>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span>Used:</span>
                  <span>
                    {formatMemory(systemInfo().memoryInfo!.usedJSHeapSize)}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>Total:</span>
                  <span>
                    {formatMemory(systemInfo().memoryInfo!.totalJSHeapSize)}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>Limit:</span>
                  <span>
                    {formatMemory(systemInfo().memoryInfo!.jsHeapSizeLimit)}
                  </span>
                </div>
                <div class="w-full bg-muted rounded-full h-2 mt-1">
                  <div
                    class="bg-primary h-2 rounded-full transition-all"
                    style={`width: ${((systemInfo().memoryInfo!.usedJSHeapSize / systemInfo().memoryInfo!.jsHeapSizeLimit) * 100).toFixed(1)}%`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* SharedArrayBuffer Usage */}
          {systemInfo().sharedBufferInfo && (
            <div class="mb-4">
              <h4 class="font-medium mb-2">SharedArrayBuffer Usage</h4>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span>Total Allocated:</span>
                  <span class="font-mono">
                    {formatMemory(systemInfo().sharedBufferInfo!.allocatedSize)}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>Max Nodes:</span>
                  <span class="font-mono">
                    {systemInfo().sharedBufferInfo!.maxNodes.toLocaleString()}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>Bytes per Node:</span>
                  <span class="font-mono">
                    {systemInfo().sharedBufferInfo!.bytesPerNode} bytes
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>String Cache:</span>
                  <span class="font-mono">
                    {systemInfo().sharedBufferInfo!.cachedStrings} strings
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>String Buffer:</span>
                  <span class="font-mono">
                    {formatMemory(
                      systemInfo().sharedBufferInfo!.stringBufferUsed
                    )}{" "}
                    /{" "}
                    {formatMemory(
                      systemInfo().sharedBufferInfo!.stringBufferSize
                    )}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span>Buffer Utilization:</span>
                  <span class="font-mono">
                    {systemInfo().sharedBufferInfo!.utilizationPercentage.toFixed(
                      1
                    )}
                    %
                    {systemInfo().sharedBufferInfo!.utilizationPercentage ===
                      0 && <span class="text-amber-600 ml-1">⚠️ Unused</span>}
                  </span>
                </div>
                <div class="w-full bg-muted rounded-full h-2 mt-1">
                  <div
                    class="bg-blue-500 h-2 rounded-full transition-all"
                    style={`width: ${systemInfo().sharedBufferInfo!.utilizationPercentage.toFixed(1)}%`}
                  />
                </div>
                <div class="text-xs text-muted-foreground mt-1">
                  {systemInfo().sharedBufferInfo!.utilizationPercentage ===
                  0 ? (
                    <span class="text-amber-600">
                      ⚠️ Buffer allocated but not used for layout calculations
                    </span>
                  ) : (
                    "✅ Actively storing node position data"
                  )}
                </div>
                <div class="text-xs text-muted-foreground">
                  Each node stores: x, y, depth, visible (4×4 bytes = 16 bytes)
                </div>
                {systemInfo().sharedBufferInfo!.utilizationPercentage === 0 && (
                  <div class="text-xs text-amber-600 mt-1">
                    💡 Buffer is allocated but position data not yet stored
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Performance Metrics */}
          <div class="mb-4">
            <h4 class="font-medium mb-2">Performance Metrics</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between items-center">
                <span>Node Expansion:</span>
                <div class="text-right">
                  <div
                    class={getStatusColor(
                      getPerformanceStatus(metrics().nodeExpansion.average)
                    )}
                  >
                    {formatTime(metrics().nodeExpansion.average)}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {metrics().nodeExpansion.count} ops
                  </div>
                </div>
              </div>

              <div class="flex justify-between items-center">
                <span>Progressive Update:</span>
                <div class="text-right">
                  <div
                    class={getStatusColor(
                      getPerformanceStatus(metrics().progressiveUpdate.average)
                    )}
                  >
                    {formatTime(metrics().progressiveUpdate.average)}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {metrics().progressiveUpdate.count} ops
                  </div>
                </div>
              </div>

              <div class="flex justify-between items-center">
                <span>Data Update:</span>
                <div class="text-right">
                  <div
                    class={getStatusColor(
                      getPerformanceStatus(metrics().dataUpdate.average)
                    )}
                  >
                    {formatTime(metrics().dataUpdate.average)}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {metrics().dataUpdate.count} ops
                  </div>
                </div>
              </div>

              <div class="flex justify-between items-center">
                <span>Tree Conversion:</span>
                <div class="text-right">
                  <div
                    class={getStatusColor(
                      getPerformanceStatus(
                        metrics().initialTreeConversion.average
                      )
                    )}
                  >
                    {formatTime(metrics().initialTreeConversion.average)}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {metrics().initialTreeConversion.count} ops
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progressive Update Breakdown */}
          <div class="mb-4">
            <details class="group">
              <summary class="cursor-pointer font-medium mb-2 flex items-center gap-2">
                <span class="transform group-open:rotate-90 transition-transform">
                  ▶
                </span>
                Progressive Update Breakdown
              </summary>
              <div class="ml-6 space-y-1 text-sm border-l-2 border-muted pl-3">
                <div class="flex justify-between items-center">
                  <span class="text-xs">Tree Traversal:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressiveTreeTraversal.average
                        )
                      )}
                    >
                      {formatTime(metrics().progressiveTreeTraversal.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressiveTreeTraversal.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Strategy Calculation:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressiveStrategyCalculation.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().progressiveStrategyCalculation.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressiveStrategyCalculation.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Visible Nodes Calc:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressiveVisibleNodesCalculation.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().progressiveVisibleNodesCalculation.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressiveVisibleNodesCalculation.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Height Calculation:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressiveHeightCalculation.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().progressiveHeightCalculation.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressiveHeightCalculation.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">SVG Height Update:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressiveSvgHeightUpdate.average
                        )
                      )}
                    >
                      {formatTime(metrics().progressiveSvgHeightUpdate.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressiveSvgHeightUpdate.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Position Calculation:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressivePositionCalculation.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().progressivePositionCalculation.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressivePositionCalculation.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Render Task Creation:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressiveRenderTaskCreation.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().progressiveRenderTaskCreation.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressiveRenderTaskCreation.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Bulk Task Queuing:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressiveBulkTaskQueuing.average
                        )
                      )}
                    >
                      {formatTime(metrics().progressiveBulkTaskQueuing.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressiveBulkTaskQueuing.count} ops
                    </div>
                  </div>
                </div>

                {/* Separator for new batched metrics */}
                <div class="border-t border-muted my-2"></div>
                <div class="text-xs text-muted-foreground mb-1 font-medium">
                  Batched Rendering (New):
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Batch Task Setup:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().progressiveBatchTaskSetup.average
                        )
                      )}
                    >
                      {formatTime(metrics().progressiveBatchTaskSetup.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().progressiveBatchTaskSetup.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Batch D3 Selection:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(metrics().batchD3Selection.average)
                      )}
                    >
                      {formatTime(metrics().batchD3Selection.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().batchD3Selection.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Batch Node Processing:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().batchNodeProcessing.average
                        )
                      )}
                    >
                      {formatTime(metrics().batchNodeProcessing.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().batchNodeProcessing.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Batch Task Setup:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(metrics().batchTaskSetup.average)
                      )}
                    >
                      {formatTime(metrics().batchTaskSetup.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().batchTaskSetup.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Batch Task Queuing:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(metrics().batchTaskQueuing.average)
                      )}
                    >
                      {formatTime(metrics().batchTaskQueuing.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().batchTaskQueuing.count} ops
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>

          {/* Node Expansion Breakdown */}
          <div class="mb-4">
            <details class="group">
              <summary class="cursor-pointer font-medium mb-2 flex items-center gap-2">
                <span class="transform group-open:rotate-90 transition-transform">
                  ▶
                </span>
                Node Expansion Breakdown
              </summary>
              <div class="ml-6 space-y-1 text-sm border-l-2 border-muted pl-3">
                <div class="text-xs text-muted-foreground mb-1 font-medium">
                  Data Processing:
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">API Call:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionApiCall.average
                        )
                      )}
                    >
                      {formatTime(metrics().nodeExpansionApiCall.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionApiCall.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">JSON Parse:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionJsonParse.average
                        )
                      )}
                    >
                      {formatTime(metrics().nodeExpansionJsonParse.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionJsonParse.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Data Processing:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionDataProcessing.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionDataProcessing.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionDataProcessing.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Worker Processing:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionWorkerProcessing.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionWorkerProcessing.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionWorkerProcessing.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Fallback Processing:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionFallbackProcessing.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionFallbackProcessing.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionFallbackProcessing.count} ops
                    </div>
                  </div>
                </div>

                <div class="border-t border-muted my-2"></div>
                <div class="text-xs text-muted-foreground mb-1 font-medium">
                  Hierarchy Creation:
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Path Construction:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionPathConstruction.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionPathConstruction.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionPathConstruction.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Children Mapping:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionChildrenMapping.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionChildrenMapping.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionChildrenMapping.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Batch Setup:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionBatchSetup.average
                        )
                      )}
                    >
                      {formatTime(metrics().nodeExpansionBatchSetup.average)}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionBatchSetup.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Hierarchy Node Creation:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionHierarchyNodeCreation.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionHierarchyNodeCreation.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionHierarchyNodeCreation.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Parent-Child Linking:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionParentChildLinking.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionParentChildLinking.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionParentChildLinking.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Position Initialization:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionPositionInitialization.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionPositionInitialization.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionPositionInitialization.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">Parent Assignment:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionParentAssignment.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionParentAssignment.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionParentAssignment.count} ops
                    </div>
                  </div>
                </div>

                <div class="border-t border-muted my-2"></div>
                <div class="text-xs text-muted-foreground mb-1 font-medium">
                  DOM Application:
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">DOM Preparation:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionDomPreparation.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionDomPreparation.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionDomPreparation.count} ops
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs">DOM Update Trigger:</span>
                  <div class="text-right">
                    <div
                      class={getStatusColor(
                        getPerformanceStatus(
                          metrics().nodeExpansionDomUpdateTrigger.average
                        )
                      )}
                    >
                      {formatTime(
                        metrics().nodeExpansionDomUpdateTrigger.average
                      )}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {metrics().nodeExpansionDomUpdateTrigger.count} ops
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>

          {/* Action Buttons */}
          <div class="flex gap-2">
            <button
              onClick={() => {
                PerformanceMonitor.clearMeasurements();
                updateMetrics();
              }}
              class="flex-1 px-3 py-1 text-sm bg-muted hover:bg-accent/10 rounded border border-border transition-colors"
            >
              Clear Metrics
            </button>
            <button
              onClick={() => {
                const config = OptimizationConfig.getConfig();
                console.log("Optimization Config:", config);
                console.log(
                  "Performance Metrics:",
                  PerformanceMonitor.getAllMeasurements()
                );
              }}
              class="flex-1 px-3 py-1 text-sm bg-muted hover:bg-accent/10 rounded border border-border transition-colors"
            >
              Log to Console
            </button>
          </div>
        </div>
      )}
    </>
  );
}
