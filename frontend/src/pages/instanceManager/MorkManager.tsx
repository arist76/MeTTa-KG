// MorkManager.tsx
import { createResource, createSignal, For, Show } from "solid-js";
import { fetchInstances, activeMorkPort, selectInstance } from "./lib";
import { SpawnModal } from "./components/SpawnModal";
import { Button } from "~/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/Card";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Server from "lucide-solid/icons/server";
import CheckCircle from "lucide-solid/icons/check-circle";
import AlertCircle from "lucide-solid/icons/alert-circle";

const MorkManager = () => {
  const [instances, { refetch }] = createResource(fetchInstances);
  const [isModalOpen, setIsModalOpen] = createSignal(false);

  return (
    <div class="container mx-auto p-6 max-w-6xl h-full flex flex-col gap-6">
      <div class="flex justify-between items-end">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Process Manager</h1>
          <p class="text-muted-foreground mt-1">
            Monitor and control distributed Mork instances.
          </p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={instances.loading}>
            <RefreshCw
              size={16}
              class={`mr-2 ${instances.loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={16} class="mr-2" />
            New Instance
          </Button>
        </div>
      </div>

      <Card class="flex-1 border-neutral-800 bg-card">
        <CardHeader>
          <CardTitle>Active Instances</CardTitle>
          <CardDescription>
            Select an instance to route API requests.
          </CardDescription>
        </CardHeader>
        <CardContent class="p-0">
          <Show
            when={!instances.loading}
            fallback={
              <div class="p-12 text-center text-muted-foreground">
                Loading processes...
              </div>
            }
          >
            <div class="relative w-full overflow-auto">
              <table class="w-full caption-bottom text-sm text-left">
                <thead class="[&_tr]:border-b [&_tr]:border-border">
                  <tr class="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Instance ID</th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground">Port</th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground w-[200px]">CPU Usage</th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground w-[200px]">Memory</th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="[&_tr:last-child]:border-0">
                  <For
                    each={instances()}
                    fallback={
                      <tr>
                        <td colspan="6" class="p-8 text-center text-muted-foreground">
                          No active instances found. Launch a new one to get started.
                        </td>
                      </tr>
                    }
                  >
                    {(instance) => {
                      const isActive = () => activeMorkPort() === instance.port;
                      return (
                        <tr
                          class={`border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted ${
                            isActive() ? "bg-primary/5 hover:bg-primary/10" : ""
                          }`}
                        >
                          <td class="p-4 align-middle">
                            <div class="flex items-center gap-2">
                              <span
                                class={`relative flex h-2.5 w-2.5 rounded-full ${
                                  instance.status === "running"
                                    ? "bg-green-500"
                                    : "bg-yellow-500"
                                }`}
                              >
                                <span
                                  class={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                                    instance.status === "running"
                                      ? "bg-green-400"
                                      : "bg-yellow-400"
                                  }`}
                                ></span>
                              </span>
                              <span class="capitalize text-xs font-medium text-muted-foreground">
                                {instance.status}
                              </span>
                            </div>
                          </td>
                          <td class="p-4 align-middle font-mono text-xs">
                            {instance.id}
                          </td>
                          <td class="p-4 align-middle">
                            <div class="flex items-center gap-2">
                              <Server size={14} class="text-muted-foreground" />
                              <span class="font-mono">{instance.port}</span>
                            </div>
                          </td>
                          <td class="p-4 align-middle">
                            <div class="flex flex-col gap-1">
                              <div class="flex justify-between text-xs">
                                <span>{instance.cpu.toFixed(1)}%</span>
                              </div>
                              <div class="h-1.5 w-full rounded-full bg-secondary">
                                <div
                                  class="h-full rounded-full bg-primary transition-all duration-500"
                                  style={{ width: `${Math.min(instance.cpu, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td class="p-4 align-middle">
                            <div class="flex flex-col gap-1">
                              <div class="flex justify-between text-xs">
                                <span>{instance.memory} MB</span>
                                <span class="text-muted-foreground">
                                  {instance.memory_limit
                                    ? `/ ${instance.memory_limit} MB`
                                    : ""}
                                </span>
                              </div>
                              <div class="h-1.5 w-full rounded-full bg-secondary">
                                <div
                                  class={`h-full rounded-full transition-all duration-500 ${
                                    instance.memory_limit &&
                                    instance.memory > instance.memory_limit * 0.9
                                      ? "bg-red-500"
                                      : "bg-blue-500"
                                  }`}
                                  style={{
                                    width: instance.memory_limit
                                      ? `${Math.min(
                                          (instance.memory / instance.memory_limit) * 100,
                                          100
                                        )}%`
                                      : "5%", // Small indicator for unlimited
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td class="p-4 align-middle text-right">
                            <Button
                              size="sm"
                              variant={isActive() ? "secondary" : "default"}
                              class={isActive() ? "pointer-events-none opacity-80" : ""}
                              onClick={() => selectInstance(instance.port)}
                            >
                              {isActive() ? (
                                <>
                                  <CheckCircle size={14} class="mr-2" />
                                  Connected
                                </>
                              ) : (
                                "Connect"
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </CardContent>
      </Card>

      <SpawnModal
        isOpen={isModalOpen()}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
};

export default MorkManager;