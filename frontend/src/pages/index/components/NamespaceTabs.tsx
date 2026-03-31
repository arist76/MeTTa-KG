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
      class={`flex items-center h-9 border-b border-primary/10 ${props.class || ""}`}
      style={{
        background: "var(--tab-bg)",
      }}
    >
      {/* Scrollable tab area */}
      <div class="flex-1 w-0 overflow-hidden relative h-full">
        <div class="flex items-center overflow-x-auto scrollbar-hide h-full">
          <For each={tabs()}>
            {(tab) => (
              <button
                onClick={() => setActiveTabId(tab.id)}
                class={`
                  flex items-center gap-2 px-5 text-xs font-medium tracking-wide
                  transition-all duration-200 min-w-[120px] max-w-[220px]
                  group flex-shrink-0 h-full border-r uppercase
                  ${
                    activeTabId() === tab.id
                      ? "tab-active"
                      : "text-muted-foreground hover:text-primary border-primary/10 bg-transparent"
                  }
                `}
                style={
                  activeTabId() === tab.id
                    ? {
                        "border-right": "1px solid hsl(var(--primary) / 0.15)",
                        "box-shadow": "inset 0 1px 0 hsl(var(--primary) / 0.1)",
                      }
                    : {
                        "border-top": "2px solid transparent",
                        "border-right": "1px solid hsl(var(--primary) / 0.08)",
                      }
                }
              >
                <span class="flex-1 text-center truncate">{tab.label}</span>
                {tabs().length > 1 && (
                  <X
                    class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity hover:opacity-100 flex-shrink-0 text-primary"
                    onClick={(e) => handleCloseTab(e, tab.id)}
                  />
                )}
              </button>
            )}
          </For>
        </div>

        {/* Fade at right edge */}
        <div
          class="absolute top-0 right-0 h-full w-8 pointer-events-none"
          style={{
            background: "linear-gradient(to right, transparent, var(--tab-bg) 85%)",
          }}
        />
      </div>

      {/* Add tab */}
      <button
        onClick={handleAddTab}
        class="flex items-center justify-center w-9 h-full transition-all duration-200 flex-shrink-0 border-l border-primary/10 text-muted-foreground hover:text-primary hover:bg-primary/5"
        title="New tab"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default NamespaceTabs;
