import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/Dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/Card";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

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

  createEffect(() => {
    if (!props.open) return;

    // Fetch resource data
    const fetchResources = async () => {
      try {
        // TODO: Replace with actual API endpoint
        // const response = await fetch('/api/system/resources');
        // const data = await response.json();

        const mockData: SystemResources = {
          totalMemory: 16384,
          usedMemory: 8192,
          cpuUsage: 45.2,
          dataSize: 512,
          processes: [
            {
              id: "1",
              name: "Transform Operation",
              cpuUsage: 23.5,
              memoryUsage: 256,
              status: "running",
            },
            {
              id: "2",
              name: "Explore Query",
              cpuUsage: 15.2,
              memoryUsage: 128,
              status: "running",
            },
            {
              id: "3",
              name: "Upload Process",
              cpuUsage: 6.5,
              memoryUsage: 64,
              status: "idle",
            },
          ],
        };
        setResources(mockData);
      } catch (error) {
        console.error("Failed to fetch system resources:", error);
      }
    };

    fetchResources();
    const interval = setInterval(fetchResources, 2000); // Update every 2 seconds

    onCleanup(() => clearInterval(interval));
  });

  const handleKillProcess = async (processId: string) => {
    try {
      // TODO: Replace with actual API endpoint
      // await fetch(`/api/system/processes/${processId}`, { method: 'DELETE' });
      console.log(`Killing process ${processId}`);

      // Remove from local state
      setResources((prev) => ({
        ...prev,
        processes: prev.processes.filter((p) => p.id !== processId),
      }));
    } catch (error) {
      console.error("Failed to kill process:", error);
    }
  };

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
                <div class="text-2xl font-bold">{resources().dataSize} MB</div>
                <div class="text-xs text-gray-500 mt-2">
                  Current workspace data
                </div>
              </CardContent>
            </Card>
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
                        <div class="flex-1">
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
                          <div class="text-sm text-gray-500 mt-1">
                            CPU: {process.cpuUsage.toFixed(1)}% | Memory:{" "}
                            {process.memoryUsage} MB
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleKillProcess(process.id)}
                        >
                          Kill Process
                        </Button>
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
