import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { clearSpace } from "~/lib/api";
import { refreshSpace } from "../load/lib";
import {
  AppError,
  ErrorSeverity,
  extractErrorInfo,
  toToastOptions,
} from "~/lib/error";

export const [expression, setExpression] = createSignal("$x \n \n \n");
export const [isLoading, setIsLoading] = createSignal(false);

export const handleClear = async (spacePath: string) => {
  try {
    // Validation
    if (!expression().trim()) {
      throw new AppError("Please enter an expression to clear.", {
        severity: ErrorSeverity.WARNING,
      });
    }

    setIsLoading(true);

    const success = await clearSpace(expression(), spacePath);

    if (success) {
      showToast({
        title: "Data Cleared Successfully",
        description: `Cleared all data matching "${expression().trim()}" from "${spacePath}".`,
      });
      refreshSpace();
    } else {
      throw new AppError(
        `Failed to clear data matching "${expression().trim()}" from space "${spacePath}". ` +
          `The expression may be invalid or the server may be busy.`,
        {
          severity: ErrorSeverity.ERROR,
          context: {
            spacePath,
            expression: expression(),
            opration: "clear",
          },
        }
      );
    }
  } catch (error) {
    let displayTitle = "Clear Failed";
    let displayMessage = "An unexpected error occured.";

    if (error instanceof AppError) {
      displayMessage = error.message;
      displayTitle =
        error.severity === ErrorSeverity.WARNING
          ? "Validation Error"
          : "Clear Failed";
    } else if (error instanceof Error) {
      if (
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        displayMessage = `Failed to connect to the server. Please verify that the MORK server is running and accessible.`;
      } else {
        displayMessage = `Failed to clear space: ${error.message}`;
      }
    }

    const errorInfo = extractErrorInfo(error, {
      displayTitle,
      displayMessage,
      context: {
        spacePath,
        expression: expression(),
        timestamp: new Date().toISOString(),
      },
    });
    showToast(toToastOptions(errorInfo));
  } finally {
    setIsLoading(false);
  }
};
