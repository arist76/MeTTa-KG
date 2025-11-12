interface SpaceNode {
  label: string;
  remoteData: {
    token: Uint32Array | null;
  };
}

interface WorkerMessage {
  type: "FLATTEN_NODES" | "PROCESS_NODES";
  id: string;
  data: {
    nodes?: any[];
    expandedNodeIds?: string[];
    childrenMap?: [string, any[]][];
    rawResponse?: string;
  };
  useSharedMemory?: boolean;
  sharedBuffer?: SharedArrayBuffer;
}

interface WorkerResponse {
  type: "READY" | "FLATTEN_RESULT" | "PROCESS_RESULT" | "ERROR";
  id?: string;
  data?: any;
  error?: string;
  timing?: number;
}

// Check if SharedArrayBuffer is available
const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";

// Helper function to get node ID
function getNodeId(node: SpaceNode): string {
  return node.remoteData.token
    ? Array.from(node.remoteData.token).join(",")
    : node.label;
}

// Flatten nodes computation (expensive operation)
function flattenNodes(
  rootNodes: any[],
  expandedNodeIds: Set<string>,
  childrenMap: Map<string, any[]>
): any[] {
  const result: any[] = [];
  const visited = new Set<string>();

  const addNode = (node: any, depth: number, path: string) => {
    if (visited.has(path)) {
      return;
    }
    visited.add(path);

    result.push({ node, id: path, depth });

    if (expandedNodeIds.has(path) && childrenMap.has(path)) {
      const nodeChildren = childrenMap.get(path)!;

      nodeChildren.forEach((child: any, index: number) => {
        const childPath = `${path}/${getNodeId(child)}#${index}`;
        addNode(child, depth + 1, childPath);
      });
    }
  };

  rootNodes.forEach((node, index) => {
    const rootPath = `${getNodeId(node)}#${index}`;
    addNode(node, 0, rootPath);
  });

  return result;
}

// Process API response (expensive JSON parsing and processing)
function processApiResponse(rawResponse: string): any {
  try {
    const parsed = JSON.parse(rawResponse);

    // Add any expensive processing here
    const result = {
      parsed,
      timestamp: Date.now(),
    };

    return result;
  } catch (error) {
    throw error;
  }
}

// Send ready signal
self.postMessage({ type: "READY" });

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, id, data, useSharedMemory, sharedBuffer } = event.data;

  const startTime = performance.now();

  try {
    let response: WorkerResponse;

    switch (type) {
      case "FLATTEN_NODES": {
        const expandedSet = new Set(data.expandedNodeIds || []);
        const childrenMap = new Map(data.childrenMap || []);

        const flattened = flattenNodes(
          data.nodes || [],
          expandedSet,
          childrenMap
        );

        response = {
          type: "FLATTEN_RESULT",
          id,
          data: flattened,
          timing: performance.now() - startTime,
        };
        break;
      }

      case "PROCESS_NODES": {
        const processed = processApiResponse(data.rawResponse || "");

        response = {
          type: "PROCESS_RESULT",
          id,
          data: processed,
          timing: performance.now() - startTime,
        };
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage(response);
  } catch (error) {
    const errorResponse: WorkerResponse = {
      type: "ERROR",
      id,
      error: error instanceof Error ? error.message : String(error),
      timing: performance.now() - startTime,
    };

    self.postMessage(errorResponse);
  }
};
