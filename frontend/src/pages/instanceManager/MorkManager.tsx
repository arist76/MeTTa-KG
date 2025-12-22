// MorkManager.tsx
import { createResource, createSignal, For, Show } from "solid-js";
import {
  fetchInstances,
  activeMorkPort,
  selectInstance,
  killInstance,
  updateInstanceLimits,
  MorkInstance,
} from "./lib"; // Import updateInstanceLimits & MorkInstance
import { SpawnModal } from "./components/SpawnModal";
import { Button } from "~/components/ui/Button";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/TextField"; // Import TextField components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/Dialog";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Server from "lucide-solid/icons/server";
import CheckCircle from "lucide-solid/icons/check-circle";
import AlertCircle from "lucide-solid/icons/alert-circle";
import Trash from "lucide-solid/icons/trash"; // Import Trash icon

const MorkManager = () => {
  const [instances, { refetch }] = createResource(fetchInstances);
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [instanceToKill, setInstanceToKill] = createSignal<number | null>(null);

  // NEW: State for editing
  const [instanceToEdit, setInstanceToEdit] = createSignal<MorkInstance | null>(
    null
  );
  const [editMemoryLimit, setEditMemoryLimit] = createSignal<string>("");
  const [editCpuLimit, setEditCpuLimit] = createSignal<string>(""); // Added

  const handleUpdateLimits = async () => {
    const inst = instanceToEdit();
    if (!inst) return;

    const memLimit = editMemoryLimit()
      ? parseInt(editMemoryLimit())
      : undefined;
    const cpuLimit = editCpuLimit() ? parseFloat(editCpuLimit()) : undefined;

    const success = await updateInstanceLimits(inst.port, memLimit, cpuLimit);

    if (success) {
      refetch();
      setInstanceToEdit(null);
    }
  };

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
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={instances.loading}
          >
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
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground">
                      Status
                    </th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground">
                      Instance ID
                    </th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground">
                      Port
                    </th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground w-[200px]">
                      CPU Usage
                    </th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground w-[200px]">
                      Memory
                    </th>
                    <th class="h-12 px-4 align-middle font-medium text-muted-foreground text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody class="[&_tr:last-child]:border-0">
                  <For
                    each={instances()}
                    fallback={
                      <tr>
                        <td
                          colspan="6"
                          class="p-8 text-center text-muted-foreground"
                        >
                          No active instances found. Launch a new one to get
                          started.
                        </td>
                      </tr>
                    }
                  >
                    {(instance) => {
                      const isActive = () => activeMorkPort() === instance.port;
                      return (
                        <tr
                          class={`border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer ${
                            isActive() ? "bg-primary/5 hover:bg-primary/10" : ""
                          }`}
                          onClick={() => {
                            setInstanceToEdit(instance);
                            setEditMemoryLimit(
                              instance.memory_limit?.toString() || ""
                            );
                          }}
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
                                <span class="text-muted-foreground">
                                  {instance.cpu_limit
                                    ? `/ ${instance.cpu_limit}%`
                                    : ""}
                                </span>
                              </div>
                              <div class="h-1.5 w-full rounded-full bg-secondary">
                                <div
                                  class={`h-full rounded-full transition-all duration-500 ${
                                    instance.cpu_limit &&
                                    instance.cpu > instance.cpu_limit
                                      ? "bg-red-500"
                                      : "bg-primary"
                                  }`}
                                  style={{
                                    width: `${Math.min(instance.cpu, 100)}%`,
                                  }}
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
                                    instance.memory >
                                      instance.memory_limit * 0.9
                                      ? "bg-red-500"
                                      : "bg-blue-500"
                                  }`}
                                  style={{
                                    width: instance.memory_limit
                                      ? `${Math.min(
                                          (instance.memory /
                                            instance.memory_limit) *
                                            100,
                                          100
                                        )}%`
                                      : "5%", // Small indicator for unlimited
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td class="p-4 align-middle text-right">
                            <div class="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant={isActive() ? "secondary" : "default"}
                                class={
                                  isActive()
                                    ? "pointer-events-none opacity-80"
                                    : ""
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectInstance(instance.port);
                                }}
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
                              <Button
                                size="sm"
                                variant="destructive"
                                title="Kill Process"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInstanceToKill(instance.port);
                                }}
                              >
                                <Trash size={14} />
                              </Button>
                            </div>
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

      {/* Kill Dialog */}
      <Dialog
        open={!!instanceToKill()}
        onOpenChange={(open) => !open && setInstanceToKill(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kill Process</DialogTitle>
            <DialogDescription>
              Are you sure you want to terminate the Mork instance on port{" "}
              <span class="font-mono font-bold">{instanceToKill()}</span>? Any
              active connections will be closed immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstanceToKill(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const port = instanceToKill();
                if (port) {
                  await killInstance(port);
                  refetch();
                  setInstanceToKill(null);
                }
              }}
            >
              Kill Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NEW: Edit Limits Dialog */}
      <Dialog
        open={!!instanceToEdit()}
        onOpenChange={(open) => !open && setInstanceToEdit(null)}
      >
        <DialogContent class="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Resources</DialogTitle>
            <DialogDescription>
              Adjust resource limits for the instance on port{" "}
              <span class="font-mono font-bold">{instanceToEdit()?.port}</span>.
            </DialogDescription>
          </DialogHeader>
          <div class="grid gap-4 py-4">
            <TextField>
              <TextFieldLabel>Memory Limit (MB)</TextFieldLabel>
              <TextFieldInput
                type="number"
                value={editMemoryLimit()}
                onInput={(e) => setEditMemoryLimit(e.currentTarget.value)}
                placeholder="Unlimited"
                min="64"
              />
            </TextField>
            <TextField>
              <TextFieldLabel>CPU Limit (%)</TextFieldLabel>
              <TextFieldInput
                type="number"
                value={editCpuLimit()}
                onInput={(e) => setEditCpuLimit(e.currentTarget.value)}
                placeholder="Unlimited"
                min="1"
                max="100"
              />
            </TextField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstanceToEdit(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateLimits}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MorkManager;
