import { createSignal } from "solid-js";
import { union } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { isCommandActive, isCommandQueued } from "~/lib/sse";
import { refreshSpace } from "../load/lib";

export const isLoading = () => isCommandActive("UNION");
export const isQueued = () => isCommandQueued("UNION");
export const [isPolling, setIsPolling] = createSignal(false);

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

    refreshSpace();
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
