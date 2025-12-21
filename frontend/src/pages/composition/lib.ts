import { createSignal } from "solid-js";
import { composition } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { isCommandRunning } from "~/lib/sse";

export { isCommandRunning as isLoading };
export const [isPolling, setIsPolling] = createSignal(false);

export type setOperationInput = {
  source: string[];
  target: string[];
};

export const stopPolling = () => {
  setIsPolling(false);
};

export const executeComposition = async (
  compositionQuery: setOperationInput,
  _spacePath: string
) => {
  if (compositionQuery.source.length < 2) {
    showToast({
      title: "Error",
      description: "Please enter at least two source namespaces",
      variant: "destructive",
    });
    return;
  }

  if (compositionQuery.target.length !== 1) {
    showToast({
      title: "Error",
      description: "Please enter a single target namespace",
      variant: "destructive",
    });
    return;
  }

  try {
    showToast({
      title: "Composition Initiated",
      description: "Waiting for results...",
    });

    await composition(compositionQuery);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    showToast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });
  }
};
