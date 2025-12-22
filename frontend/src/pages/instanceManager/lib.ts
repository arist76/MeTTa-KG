import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";

export interface MorkInstance {
  id: string;
  port: number;
  cpu: number;
  cpu_limit: number | null;
  memory: number;
  memory_limit: number | null;
  status: "running" | "stopped" | "starting";
}

export interface SpawnRequest {
  port: number;
  host?: string;
  memory_limit_mb?: number;
  cpu_limit_percent?: number;
}

export const [activeMorkPort, setActiveMorkPort] = createSignal<number | null>(
  null
);

export const fetchInstances = async (): Promise<MorkInstance[]> => {
  try {
    const response = await fetch("/api/mork/instances");
    if (!response.ok) throw new Error("Failed to fetch instances");
    return await response.json();
  } catch (e) {
    showToast({
      title: "Error",
      description: "Could not load Mork instances.",
      variant: "destructive",
    });
    return [];
  }
};

export const spawnNewInstance = async (req: SpawnRequest) => {
  try {
    const response = await fetch("/api/mork/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const error = await response.text();
      showToast({
        title: "Spawn Failed",
        description: error,
        variant: "destructive",
      });
      return false;
    }

    await selectInstance(req.port);

    setActiveMorkPort(req.port);
    showToast({
      title: "Success",
      description: `Mork instance running on port ${req.port}`,
    });
    return true;
  } catch (e: any) {
    showToast({
      title: "Spawn Failed",
      description: e.message,
      variant: "destructive",
    });
    return false;
  }
};

export const selectInstance = async (port: number) => {
  try {
    const response = await fetch(`/api/mork/select/${port}`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to select instance");

    setActiveMorkPort(port);
    showToast({
      title: "Instance Selected",
      description: `Now connected to Mork on port ${port}`,
    });
  } catch (e) {
    showToast({
      title: "Selection Failed",
      description: "Could not switch Mork instance.",
      variant: "destructive",
    });
  }
};

export const killInstance = async (port: number) => {
  try {
    const response = await fetch(`/api/mork/kill/${port}`, {
      method: "DELETE",
    });

    if (!response.ok) throw new Error("Failed to kill instance");

    if (activeMorkPort() === port) {
      setActiveMorkPort(null);
    }

    showToast({
      title: "Instance Stopped",
      description: `Mork instance on port ${port} has been terminated.`,
    });
    return true;
  } catch (e) {
    showToast({
      title: "Error",
      description: "Could not kill instance.",
      variant: "destructive",
    });
    return false;
  }
};

export const updateInstanceLimits = async (
  port: number,
  memory_limit_mb?: number,
  cpu_limit_percent?: number
) => {
  try {
    const response = await fetch(`/api/mork/update/${port}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory_limit_mb, cpu_limit_percent }),
    });

    if (!response.ok) throw new Error("Failed to update limits");

    showToast({
      title: "Limits Updated",
      description: `Resource limits for port ${port} updated.`,
    });
    return true;
  } catch (e) {
    showToast({
      title: "Update Failed",
      description: "Could not update instance limits.",
      variant: "destructive",
    });
    return false;
  }
};
