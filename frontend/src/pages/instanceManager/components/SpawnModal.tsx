// components/SpawnModal.tsx
import { createSignal } from "solid-js";
import { spawnNewInstance } from "../lib";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/Dialog";
import { Button } from "~/components/ui/Button";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/TextField";
import Activity from "lucide-solid/icons/activity";
import Network from "lucide-solid/icons/network";

export const SpawnModal = (props: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [host, setHost] = createSignal("127.0.0.1");
  const [port, setPort] = createSignal(8002);
  const [memoryLimit, setMemoryLimit] = createSignal<string>("");
  const [cpuLimit, setCpuLimit] = createSignal<string>("");
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);

    const success = await spawnNewInstance({
      port: port(),
      host: host() || undefined,
      memory_limit_mb: memoryLimit() ? parseInt(memoryLimit()) : undefined,
      cpu_limit_percent: cpuLimit() ? parseFloat(cpuLimit()) : undefined,
    });

    setLoading(false);
    if (success) {
      props.onSuccess();
      props.onClose();
      // Reset form for next use
      setPort(port() + 1);
      setMemoryLimit("");
      setCpuLimit("");
    }
  };

  return (
    <Dialog
      open={props.isOpen}
      onOpenChange={(open) => !open && props.onClose()}
    >
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Spawn New Instance</DialogTitle>
          <DialogDescription>
            Configure the network and resource limits for the new Mork process.
          </DialogDescription>
        </DialogHeader>

        <form id="spawn-form" onSubmit={handleSubmit} class="grid gap-6 py-4">
          {/* Network Section */}
          <div class="space-y-4">
            <div class="flex items-center gap-2 text-sm font-semibold text-foreground/70">
              <Network size={16} />
              <span>Network Configuration</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <TextField>
                <TextFieldLabel>Host</TextFieldLabel>
                <TextFieldInput
                  value={host()}
                  onInput={(e) => setHost(e.currentTarget.value)}
                  placeholder="127.0.0.1"
                />
              </TextField>
              <TextField>
                <TextFieldLabel>Port</TextFieldLabel>
                <TextFieldInput
                  type="number"
                  value={port()}
                  onInput={(e) => setPort(parseInt(e.currentTarget.value))}
                  min="1024"
                  max="65535"
                  required
                />
              </TextField>
            </div>
          </div>

          {/* Resources Section */}
          <div class="space-y-4">
            <div class="flex items-center gap-2 text-sm font-semibold text-foreground/70">
              <Activity size={16} />
              <span>Resource Limits (Optional)</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <TextField>
                <TextFieldLabel>Memory Limit (MB)</TextFieldLabel>
                <TextFieldInput
                  type="number"
                  value={memoryLimit()}
                  onInput={(e) => setMemoryLimit(e.currentTarget.value)}
                  placeholder="Unlimited"
                  min="64"
                />
              </TextField>
              <TextField>
                <TextFieldLabel>CPU Limit (%)</TextFieldLabel>
                <TextFieldInput
                  type="number"
                  value={cpuLimit()}
                  onInput={(e) => setCpuLimit(e.currentTarget.value)}
                  placeholder="Unlimited"
                  min="1"
                  max="100"
                />
              </TextField>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={props.onClose}
            disabled={loading()}
          >
            Cancel
          </Button>
          <Button type="submit" form="spawn-form" disabled={loading()}>
            {loading() ? "Spawning..." : "Launch Process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
