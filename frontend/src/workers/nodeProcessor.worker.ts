// Debug logger for worker
const debug = {
  log: (message: string, data?: any) => {
    console.log(`[Worker] ${message}`, data || '');
  },
  error: (message: string, error?: any) => {
    console.error(`[Worker Error] ${message}`, error || '');
  },
  time: (label: string) => {
    console.time(`[Worker] ${label}`);
  },
  timeEnd: (label: string) => {
    console.timeEnd(`[Worker] ${label}`);
  }
};

interface SpaceNode {
  label: string;
  remoteData: {
    token: Uint32Array | null;
  };
}

interface WorkerMessage {
  type: 'FLATTEN_NODES' | 'PROCESS_NODES';
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
  type: 'READY' | 'FLATTEN_RESULT' | 'PROCESS_RESULT' | 'ERROR';
  id?: string;
  data?: any;
  error?: string;
  timing?: number;
}

// Check if SharedArrayBuffer is available
const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
debug.log('Worker initialized', { hasSharedArrayBuffer });

// Helper function to get node ID
function getNodeId(node: SpaceNode): string {
  return node.remoteData.token
    ? Array.from(node.remoteData.token).join(',')
    : node.label;
}

// Flatten nodes computation (expensive operation)
function flattenNodes(
  rootNodes: any[],
  expandedNodeIds: Set<string>,
  childrenMap: Map<string, any[]>
): any[] {
  debug.time(`Flatten ${rootNodes.length} nodes`);
  
  const result: any[] = [];
  const visited = new Set<string>();

  const addNode = (node: any, depth: number, path: string) => {
    if (visited.has(path)) {
      debug.log(`Skipping visited node: ${path}`);
      return;
    }
    visited.add(path);

    result.push({ node, id: path, depth });

    if (expandedNodeIds.has(path) && childrenMap.has(path)) {
      const nodeChildren = childrenMap.get(path)!;
      debug.log(`Expanding node: ${path}`, { childCount: nodeChildren.length });
      
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

  debug.timeEnd(`Flatten ${rootNodes.length} nodes`);
  debug.log(`Flattened result`, { totalNodes: result.length });
  
  return result;
}

// Process API response (expensive JSON parsing and processing)
function processApiResponse(rawResponse: string): any {
  debug.time('Process API response');
  
  try {
    const parsed = JSON.parse(rawResponse);
    debug.log('Parsed response', { itemCount: parsed?.length || 0 });
    
    // Add any expensive processing here
    const result = {
      parsed,
      timestamp: Date.now()
    };
    
    debug.timeEnd('Process API response');
    return result;
  } catch (error) {
    debug.error('Failed to process response', error);
    throw error;
  }
}

// Send ready signal
debug.log('Sending ready signal to main thread');
self.postMessage({ type: 'READY' });

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, id, data, useSharedMemory, sharedBuffer } = event.data;
  
  debug.log(`Received message: ${type}`, { id, useSharedMemory });
  
  const startTime = performance.now();

  try {
    let response: WorkerResponse;

    switch (type) {
      case 'FLATTEN_NODES': {
        const expandedSet = new Set(data.expandedNodeIds || []);
        const childrenMap = new Map(data.childrenMap || []);
        
        const flattened = flattenNodes(
          data.nodes || [],
          expandedSet,
          childrenMap
        );

        response = {
          type: 'FLATTEN_RESULT',
          id,
          data: flattened,
          timing: performance.now() - startTime
        };
        break;
      }

      case 'PROCESS_NODES': {
        const processed = processApiResponse(data.rawResponse || '');
        
        response = {
          type: 'PROCESS_RESULT',
          id,
          data: processed,
          timing: performance.now() - startTime
        };
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    debug.log(`Sending response for ${type}`, { 
      id, 
      timing: `${response.timing?.toFixed(2)}ms` 
    });
    
    self.postMessage(response);

  } catch (error) {
    debug.error(`Error processing ${type}`, error);
    
    const errorResponse: WorkerResponse = {
      type: 'ERROR',
      id,
      error: error instanceof Error ? error.message : String(error),
      timing: performance.now() - startTime
    };
    
    self.postMessage(errorResponse);
  }
};

debug.log('Worker ready to receive messages');