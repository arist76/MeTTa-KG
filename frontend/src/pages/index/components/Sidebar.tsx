import Network from "lucide-solid/icons/network";
import { Accessor } from "solid-js";
import { A } from "@solidjs/router";

interface SidbarProps {
  activeTab: Accessor<string>;
  setActiveTab: (tab: string) => void;
  sidebarSections: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  sidebarSections,
}: SidbarProps) {
  return (
    <>
      <div
        class="relative flex flex-col w-64 h-full dot-grid"
        style={{
          background: "var(--sidebar-bg)",
          "border-right": "1px solid var(--sidebar-border)",
        }}
      >
        {/* Subtle top gradient accent */}
        <div
          class="absolute top-0 left-0 right-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(var(--primary)) 50%, transparent)",
          }}
        />

        {/* Logo */}
        <div
          class="px-4 pt-5 pb-4 border-b border-border"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center w-9 h-9 rounded-lg animate-glow-pulse border border-primary/20 bg-primary/5"
            >
              <Network class="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1
                class="font-bold text-base tracking-widest neon-text font-sans"
              >
                METTA-KG
              </h1>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span
                  class="w-1.5 h-1.5 rounded-full animate-status-pulse bg-[#00b894]"
                />
                <p class="text-xs tracking-wider text-muted-foreground">
                  VERSION 0.1.0
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-hide">
          {sidebarSections.map(
            (
              section: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
            ) => (
              <div>
                <h3
                  class="text-xs font-semibold uppercase tracking-widest mb-2 px-2 text-primary/60"
                >
                  {section.title}
                </h3>
                <div
                  class="h-px mb-3 mx-2 bg-border"
                />
                <div class="space-y-0.5">
                  {section.items.map(
                    (
                      item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
                    ) => {
                      const Icon = item.icon;
                      const isActive = () => activeTab() === item.id;
                      return (
                        <A href={item.to}>
                          <button
                            class={`
                              w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                              transition-all duration-200 cursor-pointer
                              ${
                                isActive()
                                  ? "sidebar-nav-active"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              }
                            `}
                            style={
                              isActive()
                                ? {}
                                : { "border-left": "2px solid transparent" }
                            }
                            onClick={() => setActiveTab(item.id)}
                          >
                            <span
                              class={`flex items-center justify-center w-4 h-4 flex-shrink-0 ${isActive() ? "text-primary" : ""}`}
                            >
                              {typeof Icon === "function" &&
                              Icon.name === undefined ? (
                                <Icon />
                              ) : (
                                <Icon class="h-4 w-4" />
                              )}
                            </span>
                            <span class="flex-1 text-left uppercase tracking-wide text-xs font-medium">
                              {item.label}
                            </span>
                            {isActive() && (
                              <span
                                class="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-primary"
                                style={{
                                  "box-shadow": "0 0 6px hsl(var(--primary))",
                                }}
                              />
                            )}
                          </button>
                        </A>
                      );
                    }
                  )}
                </div>
              </div>
            )
          )}
        </nav>

        {/* Footer */}
        <div
          class="px-4 py-3 border-t border-border"
        >
          <p
            class="text-xs text-center text-muted-foreground"
          >
            MeTTa Knowledge Graph
          </p>
        </div>
      </div>
    </>
  );
}
