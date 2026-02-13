import { createSignal } from "solid-js";
import { transform, isPathClear } from "~/lib/api";
import { Mm2InputMultiWithNamespace, Item } from "~/lib/types";
import { showToast } from "~/components/ui/Toast";
import { refreshSpace } from "../load/lib";
import {
  AppError,
  ErrorSeverity,
  extractErrorInfo,
  toToastOptions,
} from "~/lib/error";

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
          title: "Transform Completed",
          description: `Successfully transformed data in "${spacePath}".`,
        });
        refreshSpace();
      }
    } catch (error) {
      const errorInfo = extractErrorInfo(error, {
        displayTitle: "Connection Lost",
        displayMessage: `Lost connection while monitoring transform progress for "${spacePath}". The operation may still be running in the background.`,
        context: { spacePath, operation: "transform-polling" },
      });
      showToast(toToastOptions(errorInfo));
      stopPolling();
    }
  }, 3000);
};

export const executeTransform = async (
  patterns: Item[],
  templates: Item[],
  spacePath: string
) => {
  const patternCount = patterns.filter((p) => p.value.trim()).length;
  const templateCount = templates.filter((t) => t.value.trim()).length;

  if (patternCount === 0) {
    const errorInfo = extractErrorInfo(
      new AppError(
        "Please enter at least one pattern to match data for transformation.",
        { severity: ErrorSeverity.WARNING }
      ),
      { displayTitle: "Missing Patterns" }
    );
    showToast(toToastOptions(errorInfo));
    return;
  }
  if (templateCount === 0) {
    const errorInfo = extractErrorInfo(
      new AppError(
        "Please enter at least one template to match data for transformation.",
        { severity: ErrorSeverity.WARNING }
      ),
      { displayTitle: "Missing Template" }
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
          `Space "${spacePath}" is currently busy with another operation. Please wait for it to complete before starting the transform.`,
          {
            severity: ErrorSeverity.WARNING,
            context: { spacePath, patternCount, templateCount },
          }
        ),
        { displayTitle: "Space Busy" }
      );
      showToast(toToastOptions(errorInfo));
      setIsLoading(false);
      return;
    }

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
    const success = await transform(input);

    if (success) {
      showToast({
        title: "Transform Initiated",
        description: "Waiting for results...",
      });
      startPolling(spacePath);
    } else {
      throw new AppError(
        `Failed to start transform in "${spacePath}". ` +
          `The server may be unavailable or the pattern/template configuration may be invalid.`,
        {
          severity: ErrorSeverity.ERROR,
          context: {
            spacePath,
            patternCount,
            templateCount,
            patterns: patterns.map((p) => p.value),
            templates: templates.map((t) => t.value),
          },
        }
      );
    }
  } catch (error) {
    let displayTitle = "Transform Failed";
    let displayMessage = "An unexpected error occurred during transformation.";
    if (error instanceof AppError) {
      displayMessage = error.message;
      displayTitle =
        error.severity === ErrorSeverity.WARNING
          ? "Input Error"
          : "Transform Failed";
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
        displayMessage = `Transform failed: ${error.message}`;
      }
    }
    const errorInfo = extractErrorInfo(error, {
      displayTitle,
      displayMessage,
      context: {
        spacePath,
        patternCount,
        templateCount,
        timestamp: new Date().toISOString(),
      },
    });
    showToast(toToastOptions(errorInfo));
  } finally {
    setIsLoading(false);
  }
};
