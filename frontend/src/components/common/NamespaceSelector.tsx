import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/Button";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/Command";
import { addTab } from "~/lib/state";
import { getAllTokens } from "~/lib/api";
import { rootToken, namespace, setNamespace } from "~/lib/state";
import Folder from "lucide-solid/icons/folder";
import ChevronDown from "lucide-solid/icons/chevron-down";

type TreeNode = {
  name: string;
  fullPath: string;
  linePrefix: string;
  description: string;
};

type NamespaceTreeNode = Map<string, NamespaceTreeNode>;

export default function NamespaceSelector() {
  const [isExploring, setIsExploring] = createSignal(false);
  const [availablePaths, setAvailablePaths] = createSignal<TreeNode[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [modifierKeyPressed, setModifierKeyPressed] = createSignal(false);

  const discoverPaths = async () => {
    if (!rootToken()) return;

    setIsExploring(true);
    setIsLoading(true);

    try {
      const allTokens = await getAllTokens();
      const currentPath =
        namespace().length <= 1 ? "/" : "/" + namespace().slice(1).join("/");

      const normalizePath = (p: string) =>
        p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;

      const descriptionMap = new Map(
        allTokens.map((t) => [normalizePath(t.namespace), t.description])
      );

      const treeRoot = new Map<string, NamespaceTreeNode>();
      const descendantPaths = new Set<string>();
      for (const t of allTokens) {
        if (
          t.namespace.startsWith(currentPath) &&
          t.namespace !== currentPath
        ) {
          descendantPaths.add(t.namespace);
        }
      }

      descendantPaths.forEach((path) => {
        const relativePath = path
          .substring(currentPath.length)
          .replace(/^\//, "");
        let currentNode = treeRoot;
        const parts = relativePath.split("/").filter((p) => p.length > 0);
        parts.forEach((part) => {
          if (!currentNode.has(part)) {
            currentNode.set(part, new Map<string, NamespaceTreeNode>());
          }
          currentNode = currentNode.get(part)!;
        });
      });

      const flattenedTree: TreeNode[] = [];
      const flatten = (
        node: NamespaceTreeNode,
        path: string[],
        parentPrefix: string
      ) => {
        const childrenArray = Array.from(node.entries());
        childrenArray.forEach(([name, children], index) => {
          const isLast = index === childrenArray.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const newPath = [...path, name];
          const fullPath = "/" + newPath.join("/");

          flattenedTree.push({
            name,
            fullPath,
            linePrefix: parentPrefix + connector,
            description: descriptionMap.get(normalizePath(fullPath)) || "",
          });

          const nextParentPrefix = parentPrefix + (isLast ? " " : "│ ");
          flatten(children, newPath, nextParentPrefix);
        });
      };

      const basePath = namespace().slice(1);
      flatten(treeRoot, basePath, "");

      setAvailablePaths(flattenedTree);
    } catch (error) {
      console.error("Failed to discover paths:", error);
      setAvailablePaths([]);
    } finally {
      setIsLoading(false);
    }
  };

  const selectPath = (fullPath: string) => {
    const pathArray = fullPath.split("/").filter((p) => p.length > 0);

    if (modifierKeyPressed()) {
      addTab(["", ...pathArray]);
    } else {
      setNamespace(["", ...pathArray]);
    }
    setIsExploring(false);
    setModifierKeyPressed(false);
  };

  const currentNamespaceDisplay = () => {
    if (namespace().length <= 1) return "Root";
    const parts = namespace().filter((p) => p);
    return parts[parts.length - 1] || "Root";
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={discoverPaths}
        class="flex items-center gap-2 text-muted-foreground hover:text-foreground"
      >
        <Folder class="h-4 w-4 text-primary" />
        <span class="text-sm font-medium hidden sm:inline max-w-[120px] truncate">
          {currentNamespaceDisplay()}
        </span>
        <ChevronDown class="h-3 w-3 opacity-50" />
      </Button>

      <CommandDialog open={isExploring()} onOpenChange={setIsExploring}>
        <CommandInput placeholder="Type to filter or select a space..." />
        <CommandList>
          <Show
            when={!isLoading()}
            fallback={<CommandEmpty>Loading spaces...</CommandEmpty>}
          >
            <CommandEmpty>No further spaces found.</CommandEmpty>
            <For each={availablePaths()}>
              {(item) => (
                <CommandItem
                  class="flex justify-between items-center w-full"
                  onSelect={() => selectPath(item.fullPath)}
                  onMouseDown={(e: MouseEvent) => {
                    setModifierKeyPressed(e.ctrlKey || e.metaKey);
                  }}
                >
                  <div class="flex items-center font-mono text-sm whitespace-pre">
                    <span class="text-muted-foreground">{item.linePrefix}</span>
                    <Folder class="mr-2 h-4 w-4 flex-shrink-0 text-primary" />
                    <span class="font-sans">{item.name}</span>
                  </div>
                  <span
                    class="text-xs text-muted-foreground truncate ml-4"
                    title={item.description}
                  >
                    {item.description.length > 20
                      ? item.description.slice(0, 25) + "…"
                      : item.description}
                  </span>
                </CommandItem>
              )}
            </For>
          </Show>
        </CommandList>
      </CommandDialog>
    </>
  );
}
