import type { ExploreResponse, SpaceNode } from "~/lib/space";
import {
  initNodesFromApiResponse as originalInitNodes,
  convertToD3TreeData as originalConvertTree,
} from "~/lib/space";
import { SharedNodeBuffer } from "~/lib/sharedNodeBuffer";

// Fallback implementations for when Web Worker is not available
export class FallbackProcessor {
  static async initNodesFromApiResponse(
    data: ExploreResponse[],
    parentLabel?: string
  ): Promise<{ nodes: SpaceNode[]; prefix: string[] }> {
    // Use setTimeout to make it async and not block the main thread
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(originalInitNodes(data, parentLabel));
      }, 0);
    });
  }

  static async convertToD3TreeData(
    data: { nodes: SpaceNode[]; prefix: string[] },
    pattern: string
  ): Promise<any> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(originalConvertTree(data, pattern));
      }, 0);
    });
  }

  static async parseExpression(
    expr: string,
    nodeName: string
  ): Promise<{
    finalValue: string | null;
    isLeaf: boolean;
    hasValidValue: boolean;
  }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          // Simple approach without flattening nodes
          // Just use the expression as is, no complex parsing
          let finalValue = null;

          // Check if expr itself is a quoted string
          if (
            (expr.startsWith('"') && expr.endsWith('"')) ||
            (expr.startsWith("'") && expr.endsWith("'"))
          ) {
            finalValue = expr.slice(1, -1);
          } else {
            // Use the expr directly if it's different from nodeName
            if (expr && expr !== nodeName) {
              finalValue = expr;
            }
          }

          resolve({
            finalValue,
            isLeaf: Boolean(
              finalValue &&
                (nodeName === finalValue ||
                  nodeName === `'${finalValue}'` ||
                  nodeName === `"${finalValue}"`)
            ),
            hasValidValue: Boolean(finalValue && finalValue !== nodeName),
          });
        } catch {
          resolve({ finalValue: null, isLeaf: false, hasValidValue: false });
        }
      }, 0);
    });
  }

  static async processChildren(
    parsedChildren: ExploreResponse[],
    currentPath: string,
    depth: number
  ): Promise<{
    childrenData: any[];
    prefix: string[];
  }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const newNodesData = originalInitNodes(parsedChildren);
        const newNodes = newNodesData.nodes;
        const prefix = newNodesData.prefix;

        let childPath = currentPath;

        if (prefix.length > 0) {
          prefix.forEach((prefixPart) => {
            childPath += `/${prefixPart}`;
          });
        }

        const childrenData = newNodes.map((node: SpaceNode) => ({
          name: node.label,
          id: `${childPath}/${node.label}`,
          token: node.remoteData.token,
          expr: node.remoteData.expr,
          isExpandable: true,
          isFromBackend: true,
          depth: depth + 1,
        }));

        resolve({ childrenData, prefix });
      }, 0);
    });
  }

  static calculateLayoutPositions(
    nodeCount: number,
    nodeHeight: number,
    indentSize: number
  ): Float32Array {
    // Create a simple Float32Array for positions
    const positions = new Float32Array(nodeCount * 4); // x, y, depth, visible

    for (let i = 0; i < nodeCount; i++) {
      const baseIndex = i * 4;
      positions[baseIndex] = i * nodeHeight; // x position
      positions[baseIndex + 1] = 0; // y position (to be set by depth)
      positions[baseIndex + 2] = 0; // depth
      positions[baseIndex + 3] = 1; // visible flag
    }

    return positions;
  }
}

// Chunked processing utilities
export class ChunkedProcessor {
  static async processInChunks<T, R>(
    items: T[],
    processor: (item: T) => R,
    chunkSize: number = 100,
    delayMs: number = 1
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const chunkResults = chunk.map(processor);
      results.push(...chunkResults);

      // Yield control to the main thread
      if (i + chunkSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  static async processWithProgress<T, R>(
    items: T[],
    processor: (item: T, index: number) => R,
    onProgress?: (completed: number, total: number) => void,
    chunkSize: number = 50
  ): Promise<R[]> {
    const results: R[] = [];
    const total = items.length;

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);

      const chunkResults = chunk.map((item, chunkIndex) =>
        processor(item, i + chunkIndex)
      );

      results.push(...chunkResults);

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, total), total);
      }

      // Yield to the event loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return results;
  }
}

// Memory management utilities
export class MemoryManager {
  private static readonly MAX_CACHE_SIZE = 1000;
  private static cache = new Map<string, any>();

  static cacheResult(key: string, value: any) {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entries (simple LRU)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  static getCached(key: string): any | null {
    return this.cache.get(key) || null;
  }

  static clearCache() {
    this.cache.clear();
  }

  static getCacheSize(): number {
    return this.cache.size;
  }
}

// Performance monitoring
export class PerformanceMonitor {
  private static measurements = new Map<string, number[]>();

  static startMeasurement(label: string) {
    performance.mark(`${label}-start`);
  }

  static endMeasurement(label: string): number {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);

    const measure = performance.getEntriesByName(label, "measure")[0];
    const duration = measure ? measure.duration : 0;

    // Store measurement
    if (!this.measurements.has(label)) {
      this.measurements.set(label, []);
    }
    this.measurements.get(label)!.push(duration);

    // Cleanup
    performance.clearMarks(`${label}-start`);
    performance.clearMarks(`${label}-end`);
    performance.clearMeasures(label);

    return duration;
  }

  static getAverageTime(label: string): number {
    const times = this.measurements.get(label);
    if (!times || times.length === 0) return 0;

    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  static getAllMeasurements(): Record<
    string,
    { average: number; count: number }
  > {
    const result: Record<string, { average: number; count: number }> = {};

    this.measurements.forEach((times, label) => {
      result[label] = {
        average: this.getAverageTime(label),
        count: times.length,
      };
    });

    return result;
  }

  static clearMeasurements() {
    this.measurements.clear();
  }
}

// Enhanced FallbackProcessor with SharedNodeBuffer support
export class EnhancedFallbackProcessor extends FallbackProcessor {
  private static sharedNodeBuffer: SharedNodeBuffer | null = null;

  // Initialize SharedNodeBuffer for fallback processing
  static initStringPool(
    maxNodes: number = 50000,
    maxStringBytes: number = 5 * 1024 * 1024
  ): boolean {
    try {
      // Note: Using regular ArrayBuffer (not SharedArrayBuffer) since we're in fallback mode
      this.sharedNodeBuffer = new SharedNodeBuffer(maxNodes, maxStringBytes);

      console.info(
        "EnhancedFallbackProcessor: SharedNodeBuffer initialized for main thread processing"
      );
      return true;
    } catch (error) {
      console.warn(
        "EnhancedFallbackProcessor: Failed to initialize SharedNodeBuffer:",
        error
      );
      return false;
    }
  }

  // Process nodes with SharedNodeBuffer support
  static async initNodesWithStringPool(
    data: ExploreResponse[],
    parentLabel?: string
  ): Promise<{ nodes: SpaceNode[]; prefix: string[]; nodeIndices: number[] }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Process nodes normally
        const result = originalInitNodes(data, parentLabel);

        // Store in SharedNodeBuffer if available
        const nodeIndices: number[] = [];
        if (this.sharedNodeBuffer) {
          result.nodes.forEach((node, index) => {
            const nodeIndex = nodeIndices.length;
            this.sharedNodeBuffer!.setNodeData(
              nodeIndex,
              { x: 0, y: 0, depth: 0, visible: 1 },
              {
                name: node.label,
                id: node.id,
                expr: node.remoteData.expr,
              }
            );
            nodeIndices.push(nodeIndex);
          });
        }

        resolve({ ...result, nodeIndices });
      }, 0);
    });
  }

  // Get pooled node data
  static getPooledNodeData(nodeIndex: number): {
    position: { x: number; y: number; depth: number; visible: number };
    labels: { name: string; id: string; expr?: string };
  } | null {
    if (!this.sharedNodeBuffer) return null;

    try {
      return this.sharedNodeBuffer.getNodeData(nodeIndex);
    } catch (error) {
      console.error(
        "EnhancedFallbackProcessor: Error getting pooled node data:",
        error
      );
      return null;
    }
  }

  // Update pooled node position
  static updatePooledNodePosition(
    nodeIndex: number,
    position: { x: number; y: number; depth: number; visible: number }
  ): boolean {
    if (!this.sharedNodeBuffer) return false;

    try {
      this.sharedNodeBuffer.updatePosition(nodeIndex, position);
      return true;
    } catch (error) {
      console.error(
        "EnhancedFallbackProcessor: Error updating pooled node position:",
        error
      );
      return false;
    }
  }

  // Get buffer usage stats
  static getStringPoolUsage(): {
    stringBufferSize: number;
    stringBufferUsed: number;
    nodeBufferSize: number;
    totalAllocated: number;
    deduplicationSavings: number;
    uniqueStrings: number;
  } | null {
    if (!this.sharedNodeBuffer) return null;

    const stats = this.sharedNodeBuffer.getStats();
    return {
      stringBufferSize: stats.stringBufferSize,
      stringBufferUsed: stats.stringBufferUsed,
      nodeBufferSize: stats.nodeBufferSize,
      totalAllocated: stats.nodeBufferSize + stats.stringBufferSize,
      deduplicationSavings: 0, // Could be calculated if needed
      uniqueStrings: stats.cachedStrings,
    };
  }

  // Check if SharedNodeBuffer is available
  static isStringPoolAvailable(): boolean {
    return this.sharedNodeBuffer !== null;
  }

  // Clear SharedNodeBuffer
  static clearStringPool() {
    if (this.sharedNodeBuffer) {
      this.sharedNodeBuffer.clear();
      this.sharedNodeBuffer = null;
    }
  }
}
