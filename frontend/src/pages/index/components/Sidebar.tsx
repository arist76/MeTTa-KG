import Network from "lucide-solid/icons/network";
import { Accessor } from "solid-js";
import { Button } from "~/components/ui/Button";
import { A } from "@solidjs/router";
import Settings from "~/components/common/Settings";

interface SidebarProps {
  activeTab: Accessor<string>;
  setActiveTab: (tab: string) => void;
  sidebarSections: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  sidebarSections,
}: SidebarProps) {
  return (
    <>
      <div class="relative w-72 h-screen bg-card border-r border-border flex flex-col">
        <div class="p-4 flex flex-col h-full">
          {/* Logo */}
          <div class="flex items-center gap-3 mb-6 pb-4 border-b border-border">
            <div
              class="h-10 w-10 rounded-xl flex items-center justify-center glow"
              style={{
                background: "hsl(var(--primary))",
              }}
            >
              <Network class="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 class="text-lg font-bold tracking-tight">
                <span class="gradient-text">METTA</span>
                <span class="text-foreground">-KG</span>
              </h1>
              <p class="text-xs text-muted-foreground">v0.1.0</p>
            </div>
          </div>

          {/* Navigation */}
          <nav class="space-y-6 flex-1 overflow-y-auto">
            {sidebarSections.map(
              (
                section: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
              ) => (
                <div class="mb-8">
                  <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
                    {section.title}
                  </h3>
                  <div class="space-y-1">
                    {section.items.map(
                      (
                        item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
                      ) => {
                        const Icon = item.icon;
                        const isActive = activeTab() === item.id;
                        return (
                          <A href={item.to}>
                            <Button
                              variant="ghost"
                              class={`w-full gap-3 h-auto py-2.5 px-3 justify-start transition-all duration-200 ${
                                isActive
                                  ? "bg-primary/10 text-primary border border-primary/30 shadow-[0_0_15px_hsl(var(--primary)/0.2)]"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              }`}
                              onClick={() => setActiveTab(item.id)}
                            >
                              <div class="flex items-center justify-center w-5 h-5">
                                {typeof Icon === "function" &&
                                Icon.name === undefined ? (
                                  <Icon />
                                ) : (
                                  <Icon class="h-4 w-4" />
                                )}
                              </div>
                              <div class="flex-1 text-left">
                                <span class="text-sm font-medium">
                                  {item.label}
                                </span>
                              </div>
                              {isActive && (
                                <div
                                  class="h-1.5 w-1.5 rounded-full"
                                  style={{ background: "hsl(var(--primary))" }}
                                />
                              )}
                            </Button>
                          </A>
                        );
                      }
                    )}
                  </div>
                </div>
              )
            )}
          </nav>

          {/* Settings at Bottom */}
          <div class="pt-4 border-t border-border mt-auto">
            <Settings showLabel />
          </div>
        </div>
      </div>
    </>
  );
}
