interface SpaceNode {
  label: string;
  remoteData: {
    token: Uint32Array | null;
  };
}

// A representation of the flattened node structure for the worker
interface FlatNode {
  node: SpaceNode;
  id: string;
  depth: number;
}

// A representation of a single item from the API response
interface ExploreResponseItem {
  token: number[];
  expr: string;
}

// The shape of the object returned by processApiResponse
interface ProcessedResponse {
  parsed: ExploreResponseItem[];
  timestamp: number;
}

interface WorkerMessage {
  type: "FLATTEN_NODES" | "PROCESS_NODES";
  id: string;
  data: {
    nodes?: SpaceNode[];
    expandedNodeIds?: string[];
    childrenMap?: [string, SpaceNode[]][];
    rawResponse?: string;
  };
  useSharedMemory?: boolean;
  sharedBuffer?: SharedArrayBuffer;
}

interface WorkerResponse {
  type: "READY" | "FLATTEN_RESULT" | "PROCESS_RESULT" | "ERROR";
  id?: string;
  data?: FlatNode[] | ProcessedResponse;
  error?: string;
  timing?: number;
}

// Helper function to get node ID
function getNodeId(node: SpaceNode): string {
  return node.remoteData.token
    ? Array.from(node.remoteData.token).join(",")
    : node.label;
}

// Flatten nodes computation (expensive operation)
function flattenNodes(
  rootNodes: SpaceNode[],
  expandedNodeIds: Set<string>,
  childrenMap: Map<string, SpaceNode[]>
): FlatNode[] {
  const result: FlatNode[] = [];
  const visited = new Set<string>();

  const addNode = (node: SpaceNode, depth: number, path: string) => {
    if (visited.has(path)) {
      return;
    }
    visited.add(path);

    result.push({ node, id: path, depth });

    if (expandedNodeIds.has(path) && childrenMap.has(path)) {
      const nodeChildren = childrenMap.get(path)!;

      nodeChildren.forEach((child: SpaceNode, index: number) => {
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
function processApiResponse(rawResponse: string): ProcessedResponse {
  const parsed = JSON.parse(rawResponse) as ExploreResponseItem[];

  // Add any expensive processing here
  const result = {
    parsed,
    timestamp: Date.now(),
  };

  return result;
}

// Send ready signal
self.postMessage({ type: "READY" });

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  // Destructure sharedBuffer from the top level of event.data
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
        let rawResponse: string;

        // Use the sharedBuffer if it exists, otherwise fall back to rawResponse from data
        if (useSharedMemory && sharedBuffer) {
          const view = new Uint8Array(sharedBuffer);
          rawResponse = new TextDecoder().decode(view);
        } else if (data.rawResponse) {
          rawResponse = data.rawResponse;
        } else {
          throw new Error("No data provided for PROCESS_NODES");
        }

        const processed = processApiResponse(rawResponse);

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
