import { createSignal } from "solid-js";
import { composition } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { reportError } from "~/lib/errors";
import { isCommandActive, isAnyCommandActive } from "~/lib/sse";
export const isLoading = () => isCommandActive("COMPOSITION");
export const isAppBusy = isAnyCommandActive;
export const [isPolling, setIsPolling] = createSignal(false);

export const [error, setError] = createSignal<string | null>(null);

export type setOperationInput = {
  source: string[];
  target: string[];
};

export const stopPolling = () => {
  setIsPolling(false);
};

export const executeComposition = async (
  compositionQuery: setOperationInput
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
    reportError("composition", error);
    setError(
      error instanceof Error ? error.message : "An unexpected error occurred."
    );
  }
};
