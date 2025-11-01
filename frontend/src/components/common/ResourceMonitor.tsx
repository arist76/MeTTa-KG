import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/Dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/Card";
import { Badge } from "../ui/Badge";

// Define the shape of the non-standard `performance.memory` object
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface ApiProcessInfo {
  id: string;
  name: string;
  cpu_usage: number;
  memory_usage: number;
  status: "running" | "idle";
}

interface ProcessInfo {
  id: string;
  name: string;
  cpuUsage: number;
  memoryUsage: number;
  status: "running" | "idle";
}

interface SystemResources {
  totalMemory: number;
  usedMemory: number;
  cpuUsage: number;
  processes: ProcessInfo[];
  dataSize: number; // Size of data in RAM (in MB)
}

interface ResourceMonitorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResourceMonitor(props: ResourceMonitorProps) {
  const [resources, setResources] = createSignal<SystemResources>({
    totalMemory: 0,
    usedMemory: 0,
    cpuUsage: 0,
    processes: [],
    dataSize: 0,
  });
  const [browserMemory, setBrowserMemory] = createSignal(0);

  createEffect(() => {
    if (!props.open) return;

    const fetchResources = async () => {
      try {
        const response = await fetch("http://localhost:8000/system/resources");
        const data = await response.json();

        setResources({
          totalMemory: data.total_memory,
          usedMemory: data.used_memory,
          cpuUsage: data.cpu_usage,
          dataSize: data.data_size,
          processes: data.processes.map((p: ApiProcessInfo) => ({
            id: p.id,
            name: p.name,
            cpuUsage: p.cpu_usage,
            memoryUsage: p.memory_usage,
            status: p.status,
          })),
        });
      } catch (error) {
        console.error("Failed to fetch system resources:", error);
      }

      const perf = performance as PerformanceWithMemory;
      if (perf.memory) {
        setBrowserMemory(perf.memory.usedJSHeapSize / 1024 / 1024);
      }
    };

    fetchResources();
    const interval = setInterval(fetchResources, 500);

    onCleanup(() => clearInterval(interval));
  });

  const memoryPercentage = () =>
    (resources().usedMemory / resources().totalMemory) * 100;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>System Resource Monitor</DialogTitle>
        </DialogHeader>

        <div class="space-y-4">
          {/* Overall System Stats */}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle class="text-sm">CPU Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">
                  {resources().cpuUsage.toFixed(1)}%
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    class="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${resources().cpuUsage}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle class="text-sm">Memory Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">
                  {resources().usedMemory} MB / {resources().totalMemory} MB
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    class="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${memoryPercentage()}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle class="text-sm">Data in RAM</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="text-2xl font-bold">
                  {resources().dataSize.toFixed(1)} MB
                </div>
                <div class="text-xs text-gray-500 mt-2">
                  Current workspace data
                </div>
              </CardContent>
            </Card>

            <Show when={browserMemory() > 0}>
              <Card>
                <CardHeader>
                  <CardTitle class="text-sm">Browser Tab Memory</CardTitle>
                </CardHeader>
                <CardContent>
                  <div class="text-2xl font-bold">
                    {browserMemory().toFixed(1)} MB
                  </div>
                  <div class="text-xs text-gray-500 mt-2">
                    Memory used by this tab
                  </div>
                </CardContent>
              </Card>
            </Show>
          </div>

          {/* Active Processes */}
          <Card>
            <CardHeader>
              <CardTitle>Active Processes</CardTitle>
              <CardDescription>Running commands and operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <Show
                  when={resources().processes.length > 0}
                  fallback={
                    <div class="text-center text-gray-500 py-8">
                      No active processes
                    </div>
                  }
                >
                  <For each={resources().processes}>
                    {(process) => (
                      <div class="flex items-center justify-between p-3 border rounded-lg">
                        <div class="flex items-center gap-2">
                          <span class="font-medium">{process.name}</span>
                          <Badge
                            variant={
                              process.status === "running"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {process.status}
                          </Badge>
                        </div>
                        <div class="flex items-center gap-4 text-sm">
                          <div class="text-right">
                            <div class="font-semibold">
                              {process.cpuUsage.toFixed(1)}%
                            </div>
                            <div class="text-xs text-gray-500">CPU</div>
                          </div>
                          <div class="text-right">
                            <div class="font-semibold">
                              {process.memoryUsage} MB
                            </div>
                            <div class="text-xs text-gray-500">Memory</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
