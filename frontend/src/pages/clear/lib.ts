import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { clearSpace } from "~/lib/api";
import { isCommandRunning } from "~/lib/sse";
import { refreshSpace } from "../load/lib";

export const [expression, setExpression] = createSignal("$x \n \n \n");
export { isCommandRunning as isLoading };

export const handleClear = async (spacePath: string) => {
  if (!expression().trim()) {
    showToast({
      title: "Input Required",
      description: "Please enter an expression to clear.",
      variant: "destructive",
    });
    return;
  }

  try {
    const initiated = await clearSpace(expression(), spacePath);

    if (initiated) {
      showToast({
        title: "Clear Initiated",
        description: "Waiting for results...",
      });
    }

    refreshSpace()
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    showToast({
      title: "API Error",
      description: errorMessage,
      variant: "destructive",
    });
  }
};
