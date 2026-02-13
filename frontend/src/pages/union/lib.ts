import { createSignal } from "solid-js";
import { union, isPathClear } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import {
  AppError,
  ErrorSeverity,
  extractErrorInfo,
  toToastOptions,
} from "~/lib/error";

export const [isLoading, setIsLoading] = createSignal(false);
export const [isPolling, setIsPolling] = createSignal(false);

export type setOperationInput = {
  pattern: string[];
  template: string[];
};

let pollingIntervalId: NodeJS.Timeout | null = null;

export const stopPolling = () => {
  if (pollingIntervalId) clearInterval(pollingIntervalId);
  pollingIntervalId = null;
  setIsPolling(false);
};

export const executeUnion = async (
  unionQuery: setOperationInput,
  spacePath: string
) => {
  const patternCount = unionQuery.pattern.length;
  const templateCount = unionQuery.template.length;

  if (patternCount < 2) {
    const errorInfo = extractErrorInfo(
      new AppError(
        `Union requires at least two patterns to combine. You have provided ${patternCount}.`,
        { severity: ErrorSeverity.WARNING }
      ),
      { displayTitle: "Invalid Input" }
    );
    showToast(toToastOptions(errorInfo));
    return;
  }

  if (templateCount !== 1) {
    const errorInfo = extractErrorInfo(
      new AppError(
        `Please specify exactly one target namespace for the union result. You have provided ${templateCount}.`,
        { severity: ErrorSeverity.WARNING }
      ),
      { displayTitle: "Invalid Input" }
    );
    showToast(toToastOptions(errorInfo));
    return;
  }

  setIsLoading(true);
  stopPolling();

  try {
    if (!(await isPathClear(spacePath))) {
      const errorInfo = extractErrorInfo(
        new AppError(
          `Space "${spacePath}" is currently busy with another operation. Please wait for it to complete before starting the union.`,
          {
            severity: ErrorSeverity.WARNING,
            context: { spacePath, patternCount, templateCount },
          }
        ),
        { displayTitle: "Space Busy" }
      );
      showToast(toToastOptions(errorInfo));
      return;
    }

    showToast({
      title: "Union Started",
      description: `Combining ${patternCount} patterns into "${unionQuery.template[0]}". This may take a moment...`,
    });

    const success = await union(unionQuery);

    if (success) {
      showToast({
        title: "Union Complete",
        description: `Successfully combined ${patternCount} patterns into "${unionQuery.template[0]}".`,
      });
    } else {
      throw new AppError(
        `Failed to complete union into "${unionQuery.template[0]}". ` +
          `The server may be unavailable or one of the pattern namespaces may be invalid.`,
        {
          severity: ErrorSeverity.ERROR,
          context: {
            spacePath,
            patterns: unionQuery.pattern,
            target: unionQuery.template[0],
            patternCount,
          },
        }
      );
    }
  } catch (error) {
    let displayTitle = "Union Failed";
    let displayMessage =
      "An unexpected error occurred during the union operation.";

    if (error instanceof AppError) {
      displayMessage = error.message;
      displayTitle =
        error.severity === ErrorSeverity.WARNING
          ? "Input Error"
          : "Union Failed";
    } else if (error instanceof Error) {
      if (
        error.message.includes("fetch") ||
        error.message.includes("network") ||
        error.message.includes("Failed to fetch")
      ) {
        displayTitle = "Connection Error";
        displayMessage =
          "Could not connect to the server. Please verify the MORK server is running.";
      } else {
        displayMessage = `Union failed: ${error.message}`;
      }
    }

    const errorInfo = extractErrorInfo(error, {
      displayTitle,
      displayMessage,
      context: {
        spacePath,
        patternCount,
        target: unionQuery.template[0],
        timestamp: new Date().toISOString(),
      },
    });

    showToast(toToastOptions(errorInfo));
  } finally {
    setIsLoading(false);
  }
};
