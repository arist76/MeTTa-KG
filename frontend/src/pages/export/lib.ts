import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { exportSpace } from "~/lib/api";
import { Mm2Input } from "~/lib/types";
import {
  AppError,
  ErrorSeverity,
  extractErrorInfo,
  toToastOptions,
} from "~/lib/error";

export const [uri, setUri] = createSignal("");
export const [format, setFormat] = createSignal("metta");
export const [isLoading, setIsLoading] = createSignal(false);
export const [pattern, setPattern] = createSignal("$x\n\n\n");
export const [template, setTemplate] = createSignal("$x\n\n\n");
export const [result, setResult] = createSignal<string | null>(null);
export const [exportError, setExportError] = createSignal<Error | null>(null);

export const handleExport = async (spacePath: string) => {
  const trimmedPattern = pattern().trim();
  const trimmedTemplate = template().trim();

  if (!trimmedPattern) {
    const errorInfo = extractErrorInfo(
      new AppError("Please enter a pattern for the export operation.", {
        severity: ErrorSeverity.WARNING,
      }),
      { displayTitle: "Missing Pattern" }
    );
    showToast(toToastOptions(errorInfo));
  }

  if (trimmedTemplate) {
    const errorInfo = extractErrorInfo(
      new AppError("Please enter a template for the export operation.", {
        severity: ErrorSeverity.WARNING,
      }),
      { displayTitle: "Missing Template" }
    );
    showToast(toToastOptions(errorInfo));
  }

  const exportInput: Mm2Input = {
    pattern: trimmedPattern || "$x",
    template: trimmedTemplate || "$x",
  };

  setIsLoading(true);
  setResult(null);
  setExportError(null);

  try {
    // Validate format
    if (format() !== "metta") {
      throw new AppError(
        `Export format "${format()}" is not supported yet. Please use "metta" format for now.`,
        {
          severity: ErrorSeverity.WARNING,
          context: { format: format(), supportedFormats: ["metta"] },
        }
      );
    }

    // Export space
    const exportResponse = await exportSpace(spacePath, exportInput);

    if (!exportResponse && exportResponse !== "()") {
      throw new AppError(
        `Failed to export data from space "${spacePath}". ` +
          `The server may be unavailable, or the pattern/template may be invalid.`,
        {
          severity: ErrorSeverity.ERROR,
          context: {
            spacePath,
            pattern: trimmedPattern,
            template: trimmedTemplate,
            format: format(),
          },
        }
      );
    }
    setResult(exportResponse || "()");

    // Show success toast
    showToast({
      title: "Export Complete",
      description: `Successfully exported data matching pattern "${trimmedPattern}" from "${spacePath}".`,
    });
  } catch (error) {
    let displayTitle = "Export Failed";
    let displayMessage = "An unexpected error occured.";

    if (error instanceof AppError) {
      displayMessage = error.message;
      displayTitle =
        error.severity === ErrorSeverity.WARNING
          ? "Input Error"
          : "Export Failed";
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
        timestamp: new Date().toISOString(),
      },
    });

    showToast(toToastOptions(errorInfo));

    // Store error state
    setExportError(
      error instanceof Error ? error : new Error("Failed to export data")
    );
    setResult(null);
  } finally {
    setIsLoading(false);
  }
};
