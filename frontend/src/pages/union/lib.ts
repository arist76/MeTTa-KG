import { createSignal } from "solid-js";
import { union, isPathClear } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { isCommandRunning, setIsCommandRunning } from "~/lib/sse";

export { isCommandRunning as isLoading };
export const [isPolling, setIsPolling] = createSignal(false);

export type setOperationInput = {
  pattern: string[];
  template: string[];
};

export const stopPolling = () => {
  setIsPolling(false);
};

export const executeUnion = async (
  unionQuery: setOperationInput,
  spacePath: string
) => {
  if (unionQuery.pattern.length < 1) {
    showToast({
      title: "Error",
      description: "Please enter more than one patterns",
      variant: "destructive",
    });
    return;
  }

  if (unionQuery.template.length > 1) {
    showToast({
      title: "Error",
      description: "Please enter single template namespace",
      variant: "destructive",
    });
    return;
  }

  try {
    if (!(await isPathClear(spacePath))) {
      showToast({
        title: "Space Busy",
        description: "The space is currently busy. Please wait.",
        variant: "destructive",
      });
      return;
    }

    setIsCommandRunning(true);
    showToast({
      title: "Unification Initiated",
      description: "Waiting for results...",
    });

    await union(unionQuery);

    showToast({
      title: "Unification Complete",
      description: "Operation completed successfully!",
    });

  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    showToast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });
  } finally {
    setIsCommandRunning(false);
  }
};
