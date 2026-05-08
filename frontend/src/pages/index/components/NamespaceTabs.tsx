import { Component, For } from "solid-js";
import {
  tabs,
  activeTabId,
  setActiveTabId,
  closeTab,
  addTab,
} from "~/lib/state";
import X from "lucide-solid/icons/x";
import Plus from "lucide-solid/icons/plus";
import { tokenRootNamespace } from "~/lib/state";

interface NamespaceTabsProps {
  class?: string;
}

const NamespaceTabs: Component<NamespaceTabsProps> = (props) => {
  const handleCloseTab = (e: Event, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleAddTab = () => {
    addTab(tokenRootNamespace());
  };

  return (
    <div
      class={`flex items-center bg-background border-b border-border ${props.class || ""}`}
    >
      {/* Container with fixed width constraints */}
      <div class="flex-1 w-0 overflow-hidden relative h-full">
        <div class="flex items-center overflow-x-auto scrollbar-hide hover:scrollbar-thin scrollbar-track-transparent scrollbar-thumb-primary/30 hover:scrollbar-thumb-primary/50 h-full">
          <For each={tabs()}>
            {(tab) => (
              <button
                onClick={() => setActiveTabId(tab.id)}
                class={`
                  flex items-center gap-2 px-4 py-2 text-sm
                  transition-all duration-200 min-w-[120px] max-w-[200px] group flex-shrink-0 h-full
                  border-r border-border
                  ${
                    activeTabId() === tab.id
                      ? "bg-muted text-foreground border-t-2 border-t-primary shadow-[inset_0_1px_0_hsl(var(--primary))]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }
                `}
              >
                <span class="flex-1 text-center truncate">{tab.label}</span>
                {tabs().length > 1 && (
                  <X
                    class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive flex-shrink-0"
                    onClick={(e) => handleCloseTab(e, tab.id)}
                  />
                )}
              </button>
            )}
          </For>
        </div>

        {/* Fade effect at right edge */}
        <div
          class="absolute top-0 right-0 h-full w-12 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, hsl(var(--background)) 80%)",
          }}
        ></div>
      </div>

      {/* Static content that doesn't scroll */}
      <div class="flex items-center flex-shrink-0 border-l border-border">
        {/* Add Tab Button */}
        <button
          onClick={handleAddTab}
          class="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
          title="New tab"
        >
          <Plus class="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default NamespaceTabs;
