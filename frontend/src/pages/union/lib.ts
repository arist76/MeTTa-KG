import { createSignal } from "solid-js";
import { union } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { reportError } from "~/lib/errors";
import { isCommandActive, isAnyCommandActive } from "~/lib/sse";

export const isLoading = () => isCommandActive("UNION");
export const isAppBusy = isAnyCommandActive;
export const [isPolling, setIsPolling] = createSignal(false);
export const [error, setError] = createSignal<string | null>(null);


export type setOperationInput = {
  pattern: string[];
  template: string[];
};

export const stopPolling = () => {
  setIsPolling(false);
};

export const executeUnion = async (unionQuery: setOperationInput) => {
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
    showToast({
      title: "Unification Initiated",
      description: "Waiting for results...",
    });

    await union(unionQuery);
  } catch (error) {
    reportError("union", error);
    setError(
      error instanceof Error ? error.message : "An unexpected error occurred.",
    );
  }
};
