import { createSignal } from "solid-js";
import { transform } from "~/lib/api";
import { Mm2InputMultiWithNamespace, Item } from "~/lib/types";
import { showToast } from "~/components/ui/Toast";
import { isCommandActive, isAnyCommandActive } from "~/lib/sse";
import { refreshSpace } from "../load/lib";

export const isLoading = () => isCommandActive("TRANSFORM");
export const isAppBusy = isAnyCommandActive;
export const [isPolling, setIsPolling] = createSignal(false);

export const stopPolling = () => {
  setIsPolling(false);
};

export const executeTransform = async (patterns: Item[], templates: Item[]) => {
  if (
    !patterns.some((p) => p.value.trim()) ||
    !templates.some((t) => t.value.trim())
  ) {
    showToast({
      title: "Error",
      description: "Please enter patterns and templates.",
      variant: "destructive",
    });
    return;
  }

  try {
    const input: Mm2InputMultiWithNamespace = {
      patterns: patterns.map((p) => ({
        kind: "pattern" as const,
        value: p.value,
        namespace: p.namespace.filter((n) => n !== ""),
      })),
      templates: templates.map((t) => ({
        kind: "template" as const,
        value: t.value,
        namespace: t.namespace.filter((n) => n !== ""),
      })),
    };

    showToast({
      title: "Transform Initiated",
      description: "Waiting for results...",
    });

    await transform(input);

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
