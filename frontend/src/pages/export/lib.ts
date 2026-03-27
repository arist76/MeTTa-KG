import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { exportSpace } from "~/lib/api";
import { Mm2Input } from "~/lib/types";
import { isCommandActive, isAnyCommandActive } from "~/lib/sse";

export type ExportFormat = "metta" | "json" | "csv" | "raw";
export const [uri, setUri] = createSignal("");
export const [format, setFormat] = createSignal<ExportFormat>("metta");
export const isLoading = () => isCommandActive("EXPORT");
export const isAppBusy = isAnyCommandActive;
export const [pattern, setPattern] = createSignal("$x\n\n\n");
export const [template, setTemplate] = createSignal("$x\n\n\n");
export const [result, setResult] = createSignal<string | null>(null);
export const [exportError, setExportError] = createSignal<Error | null>(null);

export const handleExport = async (spacePath: string) => {
  const exportInput: Mm2Input = {
    pattern: pattern().trim() || "$x",
    template: template().trim() || "$x",
    format: format().charAt(0).toUpperCase() + format().slice(1),
  };

  setResult(null);
  setExportError(null);

  try {
    const exportResponse = await exportSpace(spacePath, exportInput);

    const defaultResult = exportInput.format === "Metta" ? "()" : "";
    setResult(exportResponse || defaultResult);

    showToast({
      title: "Export Complete",
      description: `Exported data with pattern: ${exportInput.pattern}`,
    });
  } catch (e) {
    const error = e instanceof Error ? e : new Error("Failed to export data");
    setExportError(error);

    let errorMessage = error.message;
    if (errorMessage.includes("Incompatible metta file")) {
      errorMessage = "Incompatible metta file";
    }

    setResult(null);
    showToast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });
  }
};
