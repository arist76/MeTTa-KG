import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { exportSpace } from "~/lib/api";
import { Mm2Input } from "~/lib/types";

export const [uri, setUri] = createSignal("");
export const [format, setFormat] = createSignal("metta");
export const [isLoading, setIsLoading] = createSignal<false | "export" | "download">(false);
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

  setIsLoading("export");
  setResult(null);
  setExportError(null);

  try {
    const exportResponse = await exportSpace(spacePath, exportInput);
    setResult(exportResponse || "()");
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
  } finally {
    setIsLoading(false);
  }
};

export const handleDownload = async (spacePath: string) => {
  const currentFormat = format();
  const exportInput: Mm2Input = {
    pattern: pattern().trim() || "$x",
    template: template().trim() || "$x",
    format: currentFormat.charAt(0).toUpperCase() + currentFormat.slice(1),
  };

  setIsLoading("download");
  setResult(null);
  setExportError(null);

  try {
    const exportResponse = await exportSpace(spacePath, exportInput);
    const data = exportResponse || "()";
    
    let mimeType = "text/plain";
    if (currentFormat === "json") mimeType = "application/json";
    if (currentFormat === "csv") mimeType = "text/csv";
    
    const blob = new Blob([data], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${new Date().toISOString().slice(0,10)}.${currentFormat === 'raw' ? 'txt' : currentFormat}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast({
      title: "Download Complete",
      description: `Downloaded data as ${currentFormat}`,
    });
  } catch (e) {
    const error = e instanceof Error ? e : new Error("Failed to download data");
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
  } finally {
    setIsLoading(false);
  }
};
