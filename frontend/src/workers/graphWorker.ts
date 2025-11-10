import { ExploreResponse, SpaceNode } from "~/lib/space";
import { parseSExpression, serializeSExpr } from "~/lib/utils";
import { SharedNodeBuffer } from "~/lib/sharedNodeBuffer";

// Worker message types
interface WorkerMessage {
  id: string;
  type: string;
  payload?: any;
}

interface InitNodesMessage extends WorkerMessage {
  type: "INIT_NODES";
  payload: {
    data: ExploreResponse[];
    parentLabel?: string;
  };
}

interface ConvertTreeMessage extends WorkerMessage {
  type: "CONVERT_TREE";
  payload: {
    nodes: SpaceNode[];
    prefix: string[];
    pattern: string;
  };
}

interface ParseExprMessage extends WorkerMessage {
  type: "PARSE_EXPR";
  payload: {
    expr: string;
    nodeName: string;
  };
}

interface ProcessChildrenMessage extends WorkerMessage {
  type: "PROCESS_CHILDREN";
  payload: {
    parsedChildren: ExploreResponse[];
    currentPath: string;
    depth: number;
  };
}

interface InitSharedBufferMessage extends WorkerMessage {
  type: "INIT_SHARED_BUFFER";
  payload: {
    nodeBuffer: SharedArrayBuffer | ArrayBuffer;
    stringBuffer: SharedArrayBuffer | ArrayBuffer;
    maxNodes: number;
  };
}

// Utility functions (copied from lib/space.ts for worker isolation)
function tokenToString(token: Uint8Array): string {
  if (token.length === 0) {
    return "-";
  } else {
    return token.join("-");
  }
}

function extractLabels(
  details: { expr: string; token: Uint8Array }[],
  _parent?: string
): { prefix: string[]; labels: (string | null)[] } {
  if (details.length === 0) return { prefix: [], labels: [] };

  // No parsing, use expr directly as labels
  const labels = details.map((detail) => detail.expr);

  return { prefix: [], labels };
}

function initNode(
  id: string,
  label: string,
  remoteData: { expr: string; token: Uint8Array }
): SpaceNode {
  return {
    id,
    label,
    remoteData,
  };
}

// Heavy computation functions to be run in worker
function initNodesFromApiResponse(
  data: ExploreResponse[],
  _parentLabel?: string
): { nodes: SpaceNode[]; prefix: string[] } {
  const processedData = data.map((item) => ({
    token: new Uint8Array(item.token),
    expr: item.expr,
  }));

  const tokens = processedData.map((item) => tokenToString(item.token));
  const { prefix, labels } = extractLabels(processedData);

  const processedLabels = labels.map((item) => {
    if (!item) return null;

    if (typeof item === "string") {
      const cleaned = item.replace(/^["']|["']$/g, "");

      try {
        const expr = parseSExpression(cleaned);
        if (expr.type === "list" && expr.children) {
          if (expr.children.length === 0) {
            return "()";
          } else if (expr.children.length === 1) {
            return "()";
          } else if (
            expr.children[0].type === "atom" &&
            expr.children[0].value?.startsWith("root")
          ) {
            const newChildren = expr.children.slice(1);
            return newChildren.map((child) => serializeSExpr(child)).join(" ");
          } else {
            return cleaned;
          }
        } else {
          return "<malformed>";
        }
      } catch {
        return "<malformed>";
      }
    }

    return String(item);
  });

  const nodes = [];
  for (let i = 0; i < tokens.length; i++) {
    const label = processedLabels[i];
    if (label !== null) {
      nodes.push(initNode(tokens[i], label, processedData[i]));
    }
  }

  return { nodes, prefix };
}

interface D3TreeNode {
  name: string;
  id: string;
  token?: Uint8Array;
  expr?: string;
  isFromBackend?: boolean;
  isExpandable?: boolean;
  children: D3TreeNode[];
}

function convertToD3TreeData(
  data: { nodes: SpaceNode[]; prefix: string[] },
  pattern: string
): D3TreeNode {
  const root: D3TreeNode = {
    name: pattern || "root",
    id: "n:",
    children: [],
  };

  if (data.prefix.length > 0) {
    let currentLevel: D3TreeNode = root;
    let currentPath = "n:";

    for (const prefixPart of data.prefix) {
      currentPath += `/${prefixPart}`;
      const child: D3TreeNode = {
        name: prefixPart,
        id: currentPath,
        children: [],
      };
      currentLevel.children = [child];
      currentLevel = child;
    }

    data.nodes.forEach((node) => {
      const leafPath = `${currentPath}/${node.label}`;
      currentLevel.children.push({
        name: node.label,
        id: leafPath,
        token: node.remoteData.token,
        expr: node.remoteData.expr,
        isFromBackend: true,
        children: [],
      });
    });
  } else {
    data.nodes.forEach((node) => {
      const nodePath = `n:/${node.label}`;

      root.children.push({
        name: node.label,
        id: nodePath,
        token: node.remoteData.token,
        expr: node.remoteData.expr,
        isFromBackend: true,
        children: [],
      });
    });
  }

  return root;
}

function processChildrenNodes(
  parsedChildren: ExploreResponse[],
  currentPath: string,
  depth: number
) {
  const newNodesData = initNodesFromApiResponse(parsedChildren);
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
    token: Array.from(node.remoteData.token), // Convert to regular array for transfer
    expr: node.remoteData.expr,
    isExpandable: true,
    isFromBackend: true,
    depth: depth + 1,
  }));

  return { childrenData, prefix };
}

function parseExpressionNodes(expr: string, nodeName: string) {
  try {
    // Simple approach without flattening nodes
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

    return {
      finalValue,
      isLeaf:
        finalValue &&
        (nodeName === finalValue ||
          nodeName === `'${finalValue}'` ||
          nodeName === `"${finalValue}"`),
      hasValidValue: finalValue && finalValue !== nodeName,
    };
  } catch {
    return { finalValue: null, isLeaf: false, hasValidValue: false };
  }
}

// Worker-side shared buffer instance
let workerSharedBuffer: SharedNodeBuffer | null = null;

// Message handler
self.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case "INIT_NODES": {
        const { data, parentLabel } = payload as InitNodesMessage["payload"];
        const result = initNodesFromApiResponse(data, parentLabel);

        // Convert Uint8Array to regular arrays for transfer
        const serializedNodes = result.nodes.map((node) => ({
          ...node,
          remoteData: {
            ...node.remoteData,
            token: Array.from(node.remoteData.token),
          },
        }));

        self.postMessage({
          id,
          type: "INIT_NODES_COMPLETE",
          payload: {
            nodes: serializedNodes,
            prefix: result.prefix,
          },
        });
        break;
      }

      case "CONVERT_TREE": {
        const { nodes, prefix, pattern } =
          payload as ConvertTreeMessage["payload"];

        // Reconstruct Uint8Arrays from regular arrays
        const reconstructedNodes = nodes.map((node) => ({
          ...node,
          remoteData: {
            ...node.remoteData,
            token: new Uint8Array(node.remoteData.token as any),
          },
        }));

        const result = convertToD3TreeData(
          { nodes: reconstructedNodes, prefix },
          pattern
        );

        // Serialize for transfer
        const serializedResult = JSON.parse(
          JSON.stringify(result, (key, value) => {
            if (value instanceof Uint8Array) {
              return Array.from(value);
            }
            return value;
          })
        );

        self.postMessage({
          id,
          type: "CONVERT_TREE_COMPLETE",
          payload: serializedResult,
        });
        break;
      }

      case "PARSE_EXPR": {
        const { expr, nodeName } = payload as ParseExprMessage["payload"];
        const result = parseExpressionNodes(expr, nodeName);

        self.postMessage({
          id,
          type: "PARSE_EXPR_COMPLETE",
          payload: result,
        });
        break;
      }

      case "PROCESS_CHILDREN": {
        const { parsedChildren, currentPath, depth } =
          payload as ProcessChildrenMessage["payload"];
        const result = processChildrenNodes(parsedChildren, currentPath, depth);

        self.postMessage({
          id,
          type: "PROCESS_CHILDREN_COMPLETE",
          payload: result,
        });
        break;
      }

      case "INIT_SHARED_BUFFER": {
        const { nodeBuffer, stringBuffer, maxNodes } =
          payload as InitSharedBufferMessage["payload"];

        try {
          // Initialize worker-side shared buffer with transferred buffers
          workerSharedBuffer = new SharedNodeBuffer(
            maxNodes,
            0,
            nodeBuffer,
            stringBuffer
          );
          console.info(
            "Worker: SharedNodeBuffer instance created, wrapping existing buffers."
          );

          self.postMessage({
            id,
            type: "INIT_SHARED_BUFFER_COMPLETE",
            payload: { success: true },
          });
        } catch (error) {
          self.postMessage({
            id,
            type: "ERROR",
            payload: {
              message: `Failed to initialize shared buffer: ${error instanceof Error ? error.message : "Unknown error"}`,
              originalType: type,
            },
          });
        }
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      id,
      type: "ERROR",
      payload: {
        message: error instanceof Error ? error.message : "Unknown error",
        originalType: type,
      },
    });
  }
});

// Export types for main thread usage
export type {
  WorkerMessage,
  InitNodesMessage,
  ConvertTreeMessage,
  ParseExprMessage,
  ProcessChildrenMessage,
  InitSharedBufferMessage,
};
