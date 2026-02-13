import { createSignal } from "solid-js";
import { composition, isPathClear } from "~/lib/api";
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

export type setOperationInput = {
  source: string[];
  target: string[];
};
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
          title: "Composition Completed",
          description: "successfully completed composition operation",
        });
        refreshSpace();
      }
    } catch (error) {
      const errorInfo = extractErrorInfo(error, {
        displayTitle: "Connection Lost", //FIX: maybe not apporpriate title
        displayMessage: `Lost connection while monitoring composition progress for "${spacePath}". The operation may still be running in the background.`,
        context: { spacePath, operation: "composition-polling" },
      });
      showToast(toToastOptions(errorInfo));
      stopPolling();
    }
  }, 3000);
};

export const executeComposition = async (
  compositionQuery: setOperationInput,
  spacePath: string
) => {
  const sourceCount = compositionQuery.source.length;
  const targetCount = compositionQuery.target.length;
  const targetNamespace = compositionQuery.target[0] || "unknown";

  if (sourceCount < 2) {
    const errorInfo = extractErrorInfo(
      new AppError(
        `Composition requires at least two source namespaces to combine data. You have provided ${sourceCount}.`,
        { severity: ErrorSeverity.WARNING }
      ),
      { displayTitle: "Invalid Input" }
    );
    showToast(toToastOptions(errorInfo));
    return;
  }

  if (targetCount !== 1) {
    const errorInfo = extractErrorInfo(
      new AppError(
        `Please specify exactly one target namespace. Composition combines multiple sources into a single destination. You have provided ${targetCount}.`,
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
          `Space "${spacePath}" is currently busy with another operation. Please wait for it to complete before starting composition.`,
          {
            severity: ErrorSeverity.WARNING,
            context: { spacePath, target: targetNamespace, sourceCount },
          }
        ),
        { displayTitle: "Space Busy" }
      );
      showToast(toToastOptions(errorInfo));
      setIsLoading(false);
      return;
    }

    const success = await composition(compositionQuery);

    if (success) {
      showToast({
        title: "Composition Initiated",
        description: `Composing ${sourceCount} source(s) into "${targetNamespace}". This may take a moment...`,
      });
      startPolling(spacePath);
    } else {
      throw new AppError(
        `Failed to start composition into "${targetNamespace}". ` +
          `The server may be unavailable or one of the source namespaces may be invalid.`,
        {
          severity: ErrorSeverity.ERROR,
          context: {
            spacePath,
            target: targetNamespace,
            sources: compositionQuery.source,
            sourceCount,
          },
        }
      );
    }
  } catch (error) {
    let displayTitle = "Composition Failed";
    let displayMessage = "An unexpected error occured.";

    if (error instanceof AppError) {
      displayMessage = error.message;
      displayTitle =
        error.severity === ErrorSeverity.WARNING
          ? "Input Error"
          : "Composition Failed";
    } else if (error instanceof Error) {
      if (
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        displayMessage =
          "Could not connect to the server. Please verify the MORK server is running.";
      } else {
        displayMessage = `Composition failed: ${error.message}`;
      }
    }

    const errorInfo = extractErrorInfo(error, {
      displayTitle,
      displayMessage,
      context: {
        spacePath,
        target: targetNamespace,
        sources: compositionQuery.source,
        timestamp: new Date().toISOString(),
      },
    });

    showToast(toToastOptions(errorInfo));
  } finally {
    setIsLoading(false);
  }
};
