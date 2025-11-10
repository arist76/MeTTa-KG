import type { WorkerMessage } from "./graphWorker";
import type { ExploreResponse, SpaceNode } from "~/lib/space";
import { CapabilityDetector } from "~/lib/capabilities";
import { SharedNodeBuffer } from "~/lib/sharedNodeBuffer";

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class GraphWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private sharedNodeBuffer: SharedNodeBuffer | null = null;
  private isInitialized = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    // Check if workers are supported before attempting to create one
    if (!CapabilityDetector.workerSupport) {
      console.info("Web Workers not supported in this browser");
      this.isInitialized = false;
      return;
    }

    try {
      // Create worker from the TypeScript file - Vite will handle the bundling
      this.worker = new Worker(new URL("./graphWorker.ts", import.meta.url), {
        type: "module",
      });

      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
      this.isInitialized = true;
    } catch (error) {
      console.warn(
        "Failed to initialize GraphWorker, falling back to main thread:",
        error
      );
      this.isInitialized = false;
    }
  }

  private handleWorkerMessage(event: MessageEvent<WorkerMessage>) {
    const { id, type, payload } = event.data;
    const request = this.pendingRequests.get(id);

    if (!request) {
      console.warn(`No pending request found for id: ${id}`);
      return;
    }

    clearTimeout(request.timeout);
    this.pendingRequests.delete(id);

    if (type === "ERROR") {
      request.reject(new Error(payload.message));
    } else {
      request.resolve(payload);
    }
  }

  private handleWorkerError(error: ErrorEvent) {
    console.error("Worker error:", error);
    // Reject all pending requests
    this.pendingRequests.forEach((request) => {
      clearTimeout(request.timeout);
      request.reject(new Error("Worker error"));
    });
    this.pendingRequests.clear();
  }

  private sendMessage(
    type: string,
    payload?: any,
    timeout = 10000
  ): Promise<any> {
    if (!this.worker || !this.isInitialized) {
      return Promise.reject(new Error("Worker not available"));
    }

    const id = `req_${++this.requestCounter}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Worker request timeout"));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      this.worker!.postMessage({ id, type, payload });
    });
  }

  // Initialize SharedArrayBuffer for node data (positions + labels)
  initSharedNodeBuffer(
    maxNodes: number = 50000,
    maxStringBytes: number = 5 * 1024 * 1024
  ): boolean {
    if (!CapabilityDetector.sharedArrayBufferSupport) {
      console.info(
        "SharedArrayBuffer not supported, using fallback ArrayBuffer"
      );
    }

    try {
      this.sharedNodeBuffer = new SharedNodeBuffer(maxNodes, maxStringBytes);

      // Transfer buffers to worker if available
      if (this.worker && this.sharedNodeBuffer.isUsingSharedMemory()) {
        const buffers = this.sharedNodeBuffer.getBuffers();
        this.sendMessage("INIT_SHARED_BUFFER", {
          nodeBuffer: buffers.nodeBuffer,
          stringBuffer: buffers.stringBuffer,
          maxNodes,
        });
      }

      console.info(
        `SharedNodeBuffer initialized: ${this.sharedNodeBuffer.isUsingSharedMemory() ? "SharedArrayBuffer" : "ArrayBuffer"}`
      );
      return true;
    } catch (error) {
      console.warn("Failed to initialize SharedNodeBuffer:", error);
      return false;
    }
  }

  // Get node data from shared buffer
  getNodeData(nodeIndex: number): {
    position: { x: number; y: number; depth: number; visible: number };
    labels: { name: string; id: string; expr?: string };
  } | null {
    if (!this.sharedNodeBuffer) return null;
    try {
      return this.sharedNodeBuffer.getNodeData(nodeIndex);
    } catch (error) {
      console.error("Error getting node data:", error);
      return null;
    }
  }

  // Update node position in shared buffer
  updateNodePosition(
    nodeIndex: number,
    position: { x: number; y: number; depth: number; visible: number }
  ): boolean {
    if (!this.sharedNodeBuffer) return false;
    try {
      this.sharedNodeBuffer.updatePosition(nodeIndex, position);
      return true;
    } catch (error) {
      console.error("Error updating node position:", error);
      return false;
    }
  }

  // Set complete node data in shared buffer
  setNodeData(
    nodeIndex: number,
    position: { x: number; y: number; depth: number; visible: number },
    labels: { name: string; id: string; expr?: string }
  ): boolean {
    if (!this.sharedNodeBuffer) return false;
    try {
      this.sharedNodeBuffer.setNodeData(nodeIndex, position, labels);
      return true;
    } catch (error) {
      console.error("Error setting node data:", error);
      return false;
    }
  }

  // Worker methods
  async initNodesFromApiResponse(
    data: ExploreResponse[],
    parentLabel?: string
  ): Promise<{ nodes: SpaceNode[]; prefix: string[] }> {
    if (!this.isInitialized) {
      throw new Error("Worker not available");
    }

    const result = await this.sendMessage("INIT_NODES", {
      data,
      parentLabel,
    });

    // Reconstruct Uint8Arrays from regular arrays
    const reconstructedNodes = result.nodes.map((node: any) => ({
      ...node,
      remoteData: {
        ...node.remoteData,
        token: new Uint8Array(node.remoteData.token),
      },
    }));

    return {
      nodes: reconstructedNodes,
      prefix: result.prefix,
    };
  }

  async convertToD3TreeData(
    data: { nodes: SpaceNode[]; prefix: string[] },
    pattern: string
  ): Promise<any> {
    if (!this.isInitialized) {
      throw new Error("Worker not available");
    }

    // Convert Uint8Arrays to regular arrays for transfer
    const serializedNodes = data.nodes.map((node) => ({
      ...node,
      remoteData: {
        ...node.remoteData,
        token: Array.from(node.remoteData.token),
      },
    }));

    const result = await this.sendMessage("CONVERT_TREE", {
      nodes: serializedNodes,
      prefix: data.prefix,
      pattern,
    });

    // Reconstruct the result with Uint8Arrays
    return JSON.parse(JSON.stringify(result), (key, value) => {
      if (key === "token" && Array.isArray(value)) {
        return new Uint8Array(value);
      }
      return value;
    });
  }

  async parseExpression(
    expr: string,
    nodeName: string
  ): Promise<{
    finalValue: string | null;
    isLeaf: boolean;
    hasValidValue: boolean;
  }> {
    if (!this.isInitialized) {
      throw new Error("Worker not available");
    }

    return this.sendMessage("PARSE_EXPR", {
      expr,
      nodeName,
    });
  }

  async processChildren(
    parsedChildren: ExploreResponse[],
    currentPath: string,
    depth: number
  ): Promise<{
    childrenData: any[];
    prefix: string[];
  }> {
    if (!this.isInitialized) {
      throw new Error("Worker not available");
    }

    return this.sendMessage("PROCESS_CHILDREN", {
      parsedChildren,
      currentPath,
      depth,
    });
  }

  // Fallback methods for capability checks
  isWorkerAvailable(): boolean {
    return this.isInitialized && this.worker !== null;
  }

  isSharedBufferAvailable(): boolean {
    return this.sharedNodeBuffer !== null;
  }

  // Compatibility alias for old code
  isSharedArrayBufferAvailable(): boolean {
    return this.isSharedBufferAvailable();
  }

  // Get buffer statistics for monitoring
  getBufferStats(): {
    nodeBufferSize: number;
    stringBufferSize: number;
    stringBufferUsed: number;
    cachedStrings: number;
  } | null {
    if (!this.sharedNodeBuffer) return null;
    return this.sharedNodeBuffer.getStats();
  }

  // Get views for direct buffer access (for compatibility)
  getNodeBufferViews(): {
    nodeView: Float32Array;
    stringView: Uint8Array;
  } | null {
    if (!this.sharedNodeBuffer) return null;
    return this.sharedNodeBuffer.getViews();
  }

  terminate() {
    if (this.worker) {
      // Clear pending requests
      this.pendingRequests.forEach((request) => {
        clearTimeout(request.timeout);
        request.reject(new Error("Worker terminated"));
      });
      this.pendingRequests.clear();

      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }

    // Clean up shared buffer
    if (this.sharedNodeBuffer) {
      this.sharedNodeBuffer.clear();
      this.sharedNodeBuffer = null;
    }
  }
}

// Singleton instance
let workerManager: GraphWorkerManager | null = null;

export function getGraphWorkerManager(): GraphWorkerManager {
  if (!workerManager) {
    workerManager = new GraphWorkerManager();
  }
  return workerManager;
}

export function terminateGraphWorker() {
  if (workerManager) {
    workerManager.terminate();
    workerManager = null;
  }
}
