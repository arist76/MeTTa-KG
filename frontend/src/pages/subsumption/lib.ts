import { createSignal } from "solid-js";
import { isPathClear, subsumption } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { refreshSpace } from "../load/lib";
import { setOperationInput } from "~/lib/types";

export const [isLoading, setIsLoading] = createSignal(false);
export const [isPolling, setIsPolling] = createSignal(false);

let pollingIntervalId: NodeJS.Timeout | null = null;

export const stopPolling = () => {
  if (pollingIntervalId) clearInterval(pollingIntervalId);
  pollingIntervalId = null;
  setIsPolling(false);
};

export const startPolling = (spacePath: string) => {
  setIsPolling(true);
  pollingIntervalId = setInterval(async () => {
    try {
      const isClear = await isPathClear(spacePath);
      if (isClear) {
        stopPolling();
        showToast({
          title: "Subsumption Completed",
          description: "successfully completed subsumtion operation",
        });
        refreshSpace();
      }
    } catch {
      showToast({
        title: "Polling Error",
        description: "Failed to fetch union status.",
        variant: "destructive",
      });
      stopPolling();
    }
  }, 3000);
};

export const executeSubsumption = async (
  subsumtionQuery: setOperationInput,
  spacePath: string
) => {
  if (subsumtionQuery.pattern.length !== 1) {
    showToast({
      title: "Error",
      description: "Please enter just one pattern",
      variant: "destructive",
    });
    return;
  }

  if (subsumtionQuery.template.length !== 1) {
    showToast({
      title: "Error",
      description: "Please enter just one template",
      variant: "destructive",
    });
    return;
  }

  setIsLoading(true);
  stopPolling();
  try {
    if (!(await isPathClear(spacePath))) {
      showToast({
        title: "Space Busy",
        description: "The space is currently busy. Please wait.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const success = await subsumption(subsumtionQuery);

    if (success) {
      showToast({
        title: "Subsumption Initiated",
        description: "Waiting for results...",
      });
      startPolling(spacePath);
    } else {
      showToast({
        title: "Subsumption Failed",
        description: "Could not initiate the subsumtion.",
        variant: "destructive",
      });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    showToast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};
