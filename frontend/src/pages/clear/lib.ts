import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { reportError } from "~/lib/errors";
import { clearSpace } from "~/lib/api";
import { isCommandActive, isAnyCommandActive } from "~/lib/sse";

export const [expression, setExpression] = createSignal("$x \n \n \n");
export const isLoading = () => isCommandActive("CLEAR");
export const isAppBusy = isAnyCommandActive;

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
  } catch (error) {
    reportError("clear", error);
  }
};
