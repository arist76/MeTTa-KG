import { onMount, onCleanup, createEffect } from "solid-js";
import * as d3 from "d3";
import type { SpaceNode } from "~/lib/space";
import {
  convertToD3TreeData,
  initNodesFromApiResponse,
  flattenNodes,
} from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import parse from "s-expression";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";

// ============================================================================
// Window TinyLFU Cache Implementation
// ============================================================================

class CountMinSketch {
  private width: number;
  private depth: number;
  private table: number[][];
  private size: number;

  constructor(width: number = 64, depth: number = 4) {
    this.width = width;
    this.depth = depth;
    this.table = Array(depth)
      .fill(0)
      .map(() => Array(width).fill(0));
    this.size = 0;
  }

  private hash(key: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash % this.width);
  }

  increment(key: string): void {
    for (let i = 0; i < this.depth; i++) {
      const index = this.hash(key, i);
      this.table[i][index] = Math.min(15, this.table[i][index] + 1); // Cap at 15
    }
    this.size++;
  }

  estimate(key: string): number {
    let min = Infinity;
    for (let i = 0; i < this.depth; i++) {
      const index = this.hash(key, i);
      min = Math.min(min, this.table[i][index]);
    }
    return min;
  }

  reset(): void {
    // Aging: halve all counts
    for (let i = 0; i < this.depth; i++) {
      for (let j = 0; j < this.width; j++) {
        this.table[i][j] = Math.floor(this.table[i][j] / 2);
      }
    }
    this.size = 0;
    console.log("[TinyLFU] Count-Min Sketch reset (aging applied)");
  }

  getSize(): number {
    return this.size;
  }
}

class WindowTinyLFU {
  private windowCache: Map<string, D3Node[]>;
  private probationaryCache: Map<string, D3Node[]>;
  private protectedCache: Map<string, D3Node[]>;
  private sketch: CountMinSketch;
  private maxSize: number;
  private windowSize: number;
  private probationarySize: number;
  private protectedSize: number;
  private sampleSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
    this.windowSize = Math.max(1, Math.floor(maxSize * 0.01)); // 1%
    const mainCacheSize = maxSize - this.windowSize; // 99
    this.probationarySize = Math.floor(mainCacheSize * 0.2); // 20% of main = ~20
    this.protectedSize = mainCacheSize - this.probationarySize; // 80% of main = ~79

    this.windowCache = new Map();
    this.probationaryCache = new Map();
    this.protectedCache = new Map();
    this.sketch = new CountMinSketch();
    this.sampleSize = 0;

    console.log(
      `[WindowTinyLFU] Initialized - Total: ${maxSize}, Window: ${this.windowSize}, Probationary: ${this.probationarySize}, Protected: ${this.protectedSize}`
    );
  }

  get(key: string): D3Node[] | undefined {
    this.sketch.increment(key);
    this.sampleSize++;

    if (this.sampleSize >= this.maxSize * 10) {
      this.sketch.reset();
      this.sampleSize = 0;
    }

    let value = this.windowCache.get(key);
    if (value) {
      console.log(`[WindowTinyLFU] HIT in Window: ${key}`);
      this.windowCache.delete(key);
      this.windowCache.set(key, value);
      return value;
    }

    value = this.probationaryCache.get(key);
    if (value) {
      console.log(
        `[WindowTinyLFU] HIT in Probationary: ${key} → Promoting to Protected`
      );
      this.probationaryCache.delete(key);
      this.addToProtected(key, value);
      return value;
    }

    value = this.protectedCache.get(key);
    if (value) {
      console.log(`[WindowTinyLFU] HIT in Protected: ${key}`);
      this.protectedCache.delete(key);
      this.protectedCache.set(key, value);
      return value;
    }

    console.log(`[WindowTinyLFU] MISS: ${key}`);
    return undefined;
  }

  set(key: string, value: D3Node[]): void {
    this.windowCache.delete(key);
    this.probationaryCache.delete(key);
    this.protectedCache.delete(key);

    if (this.windowCache.size >= this.windowSize) {
      const victimKey = this.windowCache.keys().next().value;
      const victimValue = this.windowCache.get(victimKey)!;
      this.windowCache.delete(victimKey);

      console.log(`[WindowTinyLFU] Window full, evicting: ${victimKey}`);
      this.tryAdmitToProbationary(victimKey, victimValue);
    }

    this.windowCache.set(key, value);
    console.log(
      `[WindowTinyLFU] Added to Window: ${key} | Sizes → W:${this.windowCache.size}/${this.windowSize}, P:${this.probationaryCache.size}/${this.probationarySize}, Pr:${this.protectedCache.size}/${this.protectedSize}`
    );
  }

  private tryAdmitToProbationary(key: string, value: D3Node[]): void {
    const candidateFreq = this.sketch.estimate(key);

    // FIX: Check probationary size specifically, not total main cache
    if (this.probationaryCache.size < this.probationarySize) {
      this.probationaryCache.set(key, value);
      console.log(
        `[WindowTinyLFU] Admitted to Probationary: ${key} (freq: ${candidateFreq})`
      );
      return;
    }

    // Probationary is full - compare frequencies
    const victimKey = this.probationaryCache.keys().next().value;
    const victimFreq = this.sketch.estimate(victimKey);

    if (candidateFreq > victimFreq) {
      console.log(
        `[WindowTinyLFU] EVICTING from Probationary: ${victimKey} (freq ${victimFreq}) ← REPLACING with ${key} (freq ${candidateFreq})`
      );
      this.probationaryCache.delete(victimKey);
      this.probationaryCache.set(key, value);
    } else {
      console.log(
        `[WindowTinyLFU] REJECTED: ${key} (freq ${candidateFreq}) vs ${victimKey} (freq ${victimFreq})`
      );
    }
  }

  private addToProtected(key: string, value: D3Node[]): void {
    if (this.protectedCache.size >= this.protectedSize) {
      const demoteKey = this.protectedCache.keys().next().value;
      const demoteValue = this.protectedCache.get(demoteKey)!;
      this.protectedCache.delete(demoteKey);
      console.log(
        `[WindowTinyLFU] Protected full, demoting: ${demoteKey} → Probationary`
      );

      this.tryAdmitToProbationary(demoteKey, demoteValue);
    }

    this.protectedCache.set(key, value);
    console.log(`[WindowTinyLFU] PROMOTED to Protected: ${key}`);
  }
  update(key: string, value: D3Node[]): boolean {
    if (this.windowCache.has(key)) {
      this.windowCache.set(key, value);
      console.log(`[WindowTinyLFU] Updated in Window: ${key}`);
      return true;
    }
    if (this.probationaryCache.has(key)) {
      this.probationaryCache.set(key, value);
      console.log(`[WindowTinyLFU] Updated in Probationary: ${key}`);
      return true;
    }
    if (this.protectedCache.has(key)) {
      this.protectedCache.set(key, value);
      console.log(`[WindowTinyLFU] Updated in Protected: ${key}`);
      return true;
    }
    return false;
  }
  delete(key: string): void {
    const wasInWindow = this.windowCache.delete(key);
    const wasInProbationary = this.probationaryCache.delete(key);
    const wasInProtected = this.protectedCache.delete(key);

    if (wasInWindow || wasInProbationary || wasInProtected) {
      const location = wasInWindow
        ? "Window"
        : wasInProbationary
          ? "Probationary"
          : "Protected";
      console.log(`[WindowTinyLFU] DELETED: ${key} (from ${location})`);
    }
  }

  has(key: string): boolean {
    return (
      this.windowCache.has(key) ||
      this.probationaryCache.has(key) ||
      this.protectedCache.has(key)
    );
  }

  clear(): void {
    this.windowCache.clear();
    this.probationaryCache.clear();
    this.protectedCache.clear();
    this.sketch.reset();
    this.sampleSize = 0;
    console.log("[WindowTinyLFU] Cache cleared");
  }
}

// ============================================================================
// D3 Tree Graph Component
// ============================================================================

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

  const cache = new WindowTinyLFU(100); // Adjust size based on your needs

  const expandAll = () => {
    showToast({
      title: "Info",
      description:
        "Full expand disabled to prevent excessive API calls with caching.",
    });
  };

  const collapseAll = () => {
    if (!root) return;
    root.descendants().forEach((d: D3Node) => {
      if (d.children) {
        cache.set(d.data.id, d.children);
        d.children = null;
      }
    });
    update(root);
  };

  const collapseToRoot = () => {
    if (!root) return;
    root.children?.forEach((child: D3Node) => {
      // Evict grandchildren data when collapsing to root
      if (child.children) {
        child.children.forEach((grandchild) => {
          cache.delete(grandchild.data.id);
        });
        cache.set(child.data.id, child.children);
        child.children = null;
      }
    });
    update(root);
  };

  if (props.ref) {
    props.ref({ expandAll, collapseAll, collapseToRoot });
  }

  const margin = { top: 20, right: 40, bottom: 20, left: 40 };
  const nodeHeight = 36;
  const nodeWidth = 280;
  const duration = 350;
  const indentSize = 28;

  const connector = (link: d3.HierarchyPointLink<D3Node>) => {
    const source = link.source;
    const target = link.target;
    const midY = source.y + indentSize / 2;
    return `M${source.y + 20},${source.x}
            L${midY},${source.x}
            L${midY},${target.x}
            L${target.y},${target.x}`;
  };

  const isExpandable = (d: D3Node) => {
    if (d._isLeaf) return false;
    if (d.children || cache.has(d.data.id)) return true;

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
      try {
        const flatNodes = flattenNodes(parse(d.data.expr));
        return flatNodes.length > 1;
      } catch {
        return false;
      }
    }

    return false;
  };

  const update = (source: D3Node) => {
    if (!containerRef) return;
    const allNodes = root.descendants() as D3Node[];
    const visibleNodes: D3Node[] = [];
    const traverse = (node: D3Node) => {
      visibleNodes.push(node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    traverse(root);

    const contentHeight = Math.max(
      containerRef.clientHeight,
      visibleNodes.length * nodeHeight + margin.top + margin.bottom + 40
    );

    d3.select(containerRef)
      .select("svg")
      .transition()
      .duration(duration)
      .attr("height", contentHeight);

    // Ensure all nodes have valid coordinates
    allNodes.forEach((n: D3Node) => {
      if (n.parent) {
        n.x = n.parent.x ?? 0;
        n.y = n.parent.y ?? 0;
      }
    });

    visibleNodes.forEach((n: D3Node, idx: number) => {
      n.x = idx * nodeHeight;
      n.y = n.depth * indentSize;
    });

    const links = root.links();

    const node = g
      .selectAll<SVGGElement, D3Node>("g.node")
      .data(allNodes, (d: D3Node) => d.data.id);

    const nodeEnter = node
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", `translate(${source.y0 ?? 0},${source.x0 ?? 0})`)
      .style("opacity", 0)
      .style("cursor", "pointer")
      .on("click", (event: PointerEvent, d: D3Node) => handleClick(event, d))
      .on("mouseenter", function (this: SVGGElement) {
        d3.select(this)
          .select(".node-bg")
          .transition()
          .duration(150)
          .style("fill", "hsl(var(--accent))")
          .style("opacity", 0.1);
        d3.select(this)
          .select(".node-border")
          .transition()
          .duration(150)
          .style("stroke", "hsl(var(--accent))")
          .style("opacity", 0.4);
      })
      .on("mouseleave", function (this: SVGGElement) {
        d3.select(this)
          .select(".node-bg")
          .transition()
          .duration(200)
          .style("fill", "transparent")
          .style("opacity", 1);
        d3.select(this)
          .select(".node-border")
          .transition()
          .duration(200)
          .style("stroke", "transparent")
          .style("opacity", 1);
      });

    nodeEnter
      .append("rect")
      .attr("class", "node-bg")
      .attr("x", -4)
      .attr("y", -nodeHeight / 2 + 2)
      .attr("width", nodeWidth)
      .attr("height", nodeHeight - 4)
      .attr("rx", 8)
      .style("fill", "transparent");

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

    nodeEnter
      .append("line")
      .attr("class", "parent-line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", -indentSize / 2)
      .attr("y2", 0)
      .style("stroke", "hsl(var(--muted-foreground))")
      .style("stroke-width", "1.5px")
      .style("opacity", (d: D3Node) => (d.depth === 0 ? 0 : 0.5));

    const toggleGroup = nodeEnter
      .append("g")
      .attr("class", "toggle-group")
      .style("opacity", (d: D3Node) =>
        d.children || cache.has(d.data.id) || isExpandable(d) ? 1 : 0
      );

    toggleGroup
      .append("rect")
      .attr("class", "toggle-bg")
      .attr("x", 4)
      .attr("y", -10)
      .attr("width", 20)
      .attr("height", 20)
      .attr("rx", 4)
      .style("fill", "hsl(var(--muted))")
      .style("stroke", "hsl(var(--border))")
      .style("stroke-width", "1px");

    toggleGroup
      .append("text")
      .attr("class", "toggle-icon")
      .attr("x", 14)
      .attr("y", 0)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "14px")
      .style("font-weight", "700")
      .style("fill", "hsl(var(--foreground))")
      .style("pointer-events", "none")
      .style("user-select", "none")
      .text((d: D3Node) => {
        if (d.children) return "−";
        if (cache.has(d.data.id)) return "+";
        return isExpandable(d) ? "+" : "";
      });

    nodeEnter
      .append("circle")
      .attr("class", "node-icon")
      .attr("cx", 14)
      .attr("cy", 0)
      .attr("r", 3)
      .style("fill", "hsl(var(--muted-foreground))")
      .style("opacity", (d: D3Node) =>
        d.children || cache.has(d.data.id) || isExpandable(d) ? 0 : 0.6
      );

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
      .text((d: D3Node) => {
        const maxLength = 35;
        return d.data.name.length > maxLength
          ? d.data.name.substring(0, maxLength) + "..."
          : d.data.name;
      });

    nodeEnter.append("title").text((d: D3Node) => d.data.name);

    const nodeUpdate = node
      .merge(nodeEnter)
      .transition()
      .duration(duration)
      .style("opacity", 1)
      .attr("transform", (d: D3Node) => `translate(${d.y ?? 0},${d.x ?? 0})`);

    nodeUpdate.select(".toggle-icon").text((d: D3Node) => {
      if (d.children) return "−";
      if (cache.has(d.data.id)) return "+";
      return isExpandable(d) ? "+" : "";
    });

    nodeUpdate.select(".toggle-group").style("opacity", (d: D3Node) => {
      return d.children || cache.has(d.data.id) || isExpandable(d) ? 1 : 0;
    });

    nodeUpdate.select(".node-icon").style("opacity", (d: D3Node) => {
      return d.children || cache.has(d.data.id) || isExpandable(d) ? 0 : 0.6;
    });

    node
      .exit()
      .transition()
      .duration(duration)
      .style("opacity", 0)
      .attr("transform", `translate(${source.y ?? 0},${source.x ?? 0})`)
      .remove();

    const link = g
      .selectAll<SVGPathElement, d3.HierarchyLink<D3Node>>("path.link")
      .data(links, (d: d3.HierarchyLink<D3Node>) => d.target.data.id);

    link
      .enter()
      .insert("path", "g")
      .attr("class", "link")
      .style("fill", "none")
      .style("stroke", "hsl(var(--muted-foreground))")
      .style("stroke-width", "2px")
      .style("opacity", 0)
      .attr("d", () =>
        connector({
          source: { x: source.x0 ?? 0, y: source.y0 ?? 0 },
          target: { x: source.x0 ?? 0, y: source.y0 ?? 0 },
        } as d3.HierarchyPointLink<D3Node>)
      )
      .merge(link)
      .transition()
      .duration(duration)
      .style("opacity", 0.5)
      .attr("d", connector);

    link
      .exit()
      .transition()
      .duration(duration)
      .style("opacity", 0)
      .attr("d", () =>
        connector({
          source: { x: source.x ?? 0, y: source.y ?? 0 },
          target: { x: source.x ?? 0, y: source.y ?? 0 },
        } as d3.HierarchyPointLink<D3Node>)
      )
      .remove();

    allNodes.forEach((d: D3Node) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  };

  const handleClick = async (event: PointerEvent, d: D3Node) => {
    event.stopPropagation();

    console.log(`\n========== NODE CLICK: ${d.data.name} ==========`);
    console.log(`Has children currently: ${!!d.children}`);
    console.log(`Is in cache: ${cache.has(d.data.id)}`);

    // Collapse
    if (d.children) {
      console.log(`[COLLAPSE ACTION] Collapsing node: ${d.data.name}`);
      console.log(`Number of direct children: ${d.children.length}`);

      // Evict data for expanded children when collapsing
      let evictedCount = 0;
      d.children.forEach((child) => {
        if (child.children) {
          console.log(`  → Evicting grandchild cache for: ${child.data.name}`);
          cache.delete(child.data.id);
          evictedCount++;
        }
      });
      console.log(`Total grandchildren evicted: ${evictedCount}`);

      cache.set(d.data.id, d.children);
      d.children = null;
      console.log(`[COLLAPSE COMPLETE] Node collapsed and children cached\n`);
      update(d);
      return;
    }

    // Expand from cache
    const cachedChildren = cache.get(d.data.id);
    if (cachedChildren) {
      console.log(
        `[EXPAND FROM CACHE] Restoring ${cachedChildren.length} children from cache`
      );
      d.children = cachedChildren;
      console.log(`[EXPAND COMPLETE] Children restored from cache\n`);
      update(d);
      return;
    }

    if (!isExpandable(d)) {
      console.log(`[NOT EXPANDABLE] Node cannot be expanded\n`);
      return;
    }

    if (d.data.token && Array.from(d.data.token).join(",") === "-1") {
      console.log(`[INVALID TOKEN] Node has invalid token (-1)\n`);
      return;
    }

    console.log(`[API FETCH] Fetching children from backend...`);

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
        console.log(`[INVALID TOKEN] Token check failed\n`);
        return;
      }

      if (!d.data.token || d.data.token.length === 0) {
        console.log(`[NO TOKEN] No token available\n`);
        return;
      }

      const children = await exploreSpace(
        formatedNamespace(),
        props.pattern,
        spaceNode.remoteData.token
      );
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const parsedChildren = JSON.parse(children as any);

      if (parsedChildren && parsedChildren.length > 0) {
        const newNodesData = initNodesFromApiResponse(parsedChildren);
        const newNodes = newNodesData.nodes;

        console.log(
          `[API SUCCESS] Received ${newNodes.length} children from backend`
        );

        const currentPath = d.data.id;

        const childrenData = newNodes.map((node: SpaceNode) => ({
          name: node.label,
          id: `${currentPath}/${node.label}`,
          token: node.remoteData.token,
          expr: node.remoteData.expr,
          isExpandable: true,
          isFromBackend: true,
        }));

        const childHierarchyNodes = childrenData.map((childData) => {
          const childNode = d3.hierarchy(childData) as D3Node;
          childNode.depth = d.depth + 1;
          childNode.parent = d;
          childNode.x0 = d.x;
          childNode.y0 = d.y;
          return childNode;
        });

        cache.set(d.data.id, childHierarchyNodes);
        d.children = childHierarchyNodes;
        console.log(`[EXPAND COMPLETE] Children added and cached\n`);
        update(d);
      } else if (
        spaceNode.remoteData.expr &&
        spaceNode.remoteData.expr.trim() !== ""
      ) {
        console.log(
          `[EXPR PARSING] Parsing expression: ${spaceNode.remoteData.expr.substring(0, 50)}...`
        );
        try {
          const flatNodes = flattenNodes(parse(spaceNode.remoteData.expr));

          let finalValue = null;

          for (const node of flatNodes) {
            if (
              (node.startsWith('"') && node.endsWith('"')) ||
              (node.startsWith("'") && node.endsWith("'"))
            ) {
              finalValue = node.slice(1, -1);
              break;
            }
          }

          if (!finalValue && flatNodes.length > 0) {
            const lastNode = flatNodes[flatNodes.length - 1];
            if (lastNode && lastNode !== d.data.name) {
              finalValue = lastNode;
            }
          }

          if (
            finalValue &&
            (d.data.name === finalValue ||
              d.data.name === `'${finalValue}'` ||
              d.data.name === `"${finalValue}"`)
          ) {
            console.log(`[LEAF NODE] Value matches name, marking as leaf\n`);
            d.children = null;
            d._isLeaf = true;
            update(d);
            return;
          }

          if (finalValue && finalValue !== d.data.name) {
            console.log(`[EXPR VALUE] Creating value child: ${finalValue}`);
            const childData = {
              name: finalValue,
              id: `${d.data.id}/value`,
              token: Uint8Array.from([-1]),
              expr: "",
              isExpandable: false,
              isFromBackend: false,
            };

            const childNode = d3.hierarchy(childData) as D3Node;
            childNode.depth = d.depth + 1;
            childNode.parent = d;
            childNode.x0 = d.x;
            childNode.y0 = d.y;

            const childNodes = [childNode];
            cache.set(d.data.id, childNodes);
            d.children = childNodes;
            console.log(`[EXPAND COMPLETE] Expression value child added\n`);
            update(d);
          } else {
            console.log(`[LEAF NODE] No expandable value found\n`);
            d.children = null;
            d._isLeaf = true;
            update(d);
          }
        } catch (error) {
          console.log(`[EXPR ERROR] Failed to parse expression:`, error);
          d.children = null;
        }
      } else {
        console.log(`[LEAF NODE] No children or expression\n`);
        d._isLeaf = true;
        d.children = null;
        update(d);
      }
    } catch (error) {
      console.log(`[API ERROR] Failed to fetch children:`, error);
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
      update(d);
    }
  };

  onMount(() => {
    if (!containerRef) return;

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

    const treeData = convertToD3TreeData(props.data, props.pattern);
    root = d3.hierarchy(treeData) as D3Node;
    root.x0 = 0;
    root.y0 = 0;
  });

  createEffect(() => {
    if (!g || !root) return;

    const treeData = convertToD3TreeData(props.data, props.pattern);
    const newRoot = d3.hierarchy(treeData) as D3Node;

    root.data = newRoot.data;
    root.children = newRoot.children;
    root.x0 = 0;
    root.y0 = 0;

    root.descendants().forEach((d: D3Node) => {
      d.x = d.depth * indentSize;
      d.y = d.depth * indentSize;

      if (d.depth && d.children) {
        cache.set(d.data.id, d.children);
        d.children = null;
      }
    });

    update(root);
  });

  onCleanup(() => {
    if (containerRef) d3.select(containerRef).selectAll("*").remove();
    cache.clear();
  });

  return (
    <div
      ref={containerRef!}
      class="w-full h-full overflow-auto custom-scrollbar bg-card rounded-lg border border-border shadow-sm"
    />
  );
}
