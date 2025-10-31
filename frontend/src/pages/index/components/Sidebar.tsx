import Network from "lucide-solid/icons/network";
import Activity from "lucide-solid/icons/activity";
import { Accessor, createSignal } from "solid-js";
import { Button } from "~/components/ui/Button";
import { A } from "@solidjs/router";
import { ResourceMonitor } from "~/components/common/ResourceMonitor";

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
  const [resourceMonitorOpen, setResourceMonitorOpen] = createSignal(false);

  return (
    <>
      <div class="relative w-80 bg-neutral-900 border-r border-neutral-700 flex flex-col">
        <div class="p-3 flex-1">
          <div class="flex items-center gap-2 mb-8">
            <Network class="h-8 w-8 text-primary" />
            <div>
              <h1 class="text-primary font-bold text-lg tracking-wider">
                METTA-KG
              </h1>
              <p class="text-neutral-500 text-xs">VERSION 0.1.0</p>
            </div>
          </div>

          {/* <ScrollArea class="h-[calc(100vh-120px)]"> */}
          <nav class="space-y-6 mt-12">
            {sidebarSections.map(
              (
                section: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
              ) => (
                <div class="mb-12">
                  <h3 class="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-2">
                    {section.title}
                  </h3>
                  <div class="space-y-1">
                    {section.items.map(
                      (
                        item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
                      ) => {
                        const Icon = item.icon;
                        return (
                          <A href={item.to}>
                            <Button
                              variant={
                                activeTab() === item.id ? "default" : "ghost"
                              }
                              class={`w-full gap-3 h-auto py-2 px-3 justify-start ${
                                activeTab() === item.id
                                  ? "bg-primary text-white"
                                  : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                              }`}
                              onClick={() => setActiveTab(item.id)}
                            >
                              <div class="flex items-center justify-center w-4 h-4">
                                {typeof Icon === "function" &&
                                Icon.name === undefined ? (
                                  <Icon />
                                ) : (
                                  <Icon class="h-4 w-4" />
                                )}
                              </div>
                              <div class="flex-1 text-left">
                                <div class="flex items-center gap-2 uppercase">
                                  {item.label}
                                </div>
                                {item.description && (
                                  <div class="text-xs text-neutral-500 mt-0.5">
                                    {item.description}
                                  </div>
                                )}
                              </div>
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
          {/* </ScrollArea> */}
        </div>

        {/* Resource Monitor Button at Bottom */}
        <div class="p-3 border-t border-neutral-700">
          <Button
            variant="ghost"
            class="w-full gap-3 h-auto py-2 px-3 justify-start text-neutral-400 hover:text-white hover:bg-neutral-800"
            onClick={() => setResourceMonitorOpen(true)}
          >
            <div class="flex items-center justify-center w-4 h-4">
              <Activity class="h-4 w-4" />
            </div>
            <div class="flex-1 text-left">
              <div class="flex items-center gap-2 uppercase">Resources</div>
              <div class="text-xs text-neutral-500 mt-0.5">
                Monitor system usage
              </div>
            </div>
          </Button>
        </div>
      </div>

      {/* Resource Monitor Dialog */}
      <ResourceMonitor
        open={resourceMonitorOpen()}
        onOpenChange={setResourceMonitorOpen}
      />
    </>
  );
}
