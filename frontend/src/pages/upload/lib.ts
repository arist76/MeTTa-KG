import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { importData, uploadTextToSpace, importSpace } from "~/lib/api";
import { refreshSpace } from "../load/lib";
import {
  AppError,
  ErrorSeverity,
  extractErrorInfo,
  toToastOptions,
} from "~/lib/error";

type UploadResult =
  | null
  | string
  | { data: string; status: "success" }
  | { error: string };

export interface FileState {
  name: string;
  size: number;
  type: string;
  content: ArrayBuffer;
}

export const [uri, setUri] = createSignal("");
export const [urlFormat, setUrlFormat] = createSignal("metta");
export const [selectedFile, setSelectedFile] = createSignal<FileState | null>(
  null
);
export const [textContent, setTextContent] = createSignal(`()`);
export const [textFormat, setTextFormat] = createSignal("metta");
export const [fileFormat, setFileFormat] = createSignal("metta");
export const [activeTab, setActiveTab] = createSignal("url");
export const [isLoading, setIsLoading] = createSignal(false);
export const [result, setResult] = createSignal<UploadResult>(null);

export const isFileUploadImplemented = true;

export const handleFileSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    const buffer = await file.arrayBuffer();
    setSelectedFile({
      name: file.name,
      size: file.size,
      type: file.type,
      content: buffer,
    });
  }
};

export const handleImport = async (spacePath: string) => {
  setIsLoading(true);
  setResult(null);
  const currentTab = activeTab();

  try {
    switch (currentTab) {
      case "url": {
        const url = uri().trim();
        const format = urlFormat();

        if (!url) {
          const errorInfo = extractErrorInfo(
            new AppError("Please enter a URL to import data from.", {
              severity: ErrorSeverity.WARNING,
              context: { tab: "url" },
            }),
            { displayTitle: "Missing URL" }
          );
          showToast(toToastOptions(errorInfo));
          return;
        }

        if (format !== "metta") {
          const errorInfo = extractErrorInfo(
            new AppError(
              `The "${format}" format is not supported yet. Please use MeTTa format for now.`,
              {
                severity: ErrorSeverity.WARNING,
                context: { tab: "url", format },
              }
            ),
            { displayTitle: "Format Not Supported" }
          );
          showToast(toToastOptions(errorInfo));
          return;
        }

        const response = await importSpace(spacePath, url);

        if (response) {
          setResult("Successfully imported to space");
          showToast({
            title: "Import Successful",
            description: `Data was imported from "${url}" into "${spacePath}".`,
          });
          setTimeout(() => refreshSpace(), 1000);
        } else {
          throw new AppError(
            `Failed to import data from "${url}" into "${spacePath}". The URL may be invalid or the server may be unavailable.`,
            {
              severity: ErrorSeverity.ERROR,
              context: { tab: "url", uri: url, spacePath },
            }
          );
        }
        break;
      }

      case "file": {
        const fileState = selectedFile();
        const format = fileFormat();

        if (!fileState) {
          const errorInfo = extractErrorInfo(
            new AppError("Please select a file to upload.", {
              severity: ErrorSeverity.WARNING,
              context: { tab: "file" },
            }),
            { displayTitle: "No File Selected" }
          );
          showToast(toToastOptions(errorInfo));
          return;
        }

        if (format !== "metta") {
          const errorInfo = extractErrorInfo(
            new AppError(
              `The "${format}" format is not supported yet. Please use MeTTa format for now.`,
              {
                severity: ErrorSeverity.WARNING,
                context: { tab: "file", format, fileName: fileState.name },
              }
            ),
            { displayTitle: "Format Not Supported" }
          );
          showToast(toToastOptions(errorInfo));
          return;
        }

        const formData = new FormData();
        formData.append(
          "file",
          new File([fileState.content], fileState.name, {
            type: fileState.type,
          })
        );

        const response = await importData("file", formData, format, spacePath);

        if (response.status === "success") {
          setResult({ data: response.data, status: "success" });
          showToast({
            title: "File Uploaded",
            description: `File "${fileState.name}" (${formatFileSize(
              fileState.size
            )}) was uploaded to "${spacePath}".`,
          });
          refreshSpace();
        } else {
          throw new AppError(
            `Failed to upload "${fileState.name}" to "${spacePath}". ${response.message}`,
            {
              severity: ErrorSeverity.ERROR,
              context: {
                tab: "file",
                fileName: fileState.name,
                fileSize: fileState.size,
                spacePath,
              },
            }
          );
        }
        break;
      }

      case "text": {
        const text = textContent().trim();
        const format = textFormat();

        if (!text) {
          const errorInfo = extractErrorInfo(
            new AppError("Please enter MeTTa text to upload.", {
              severity: ErrorSeverity.WARNING,
              context: { tab: "text" },
            }),
            { displayTitle: "Missing Text" }
          );
          showToast(toToastOptions(errorInfo));
          return;
        }

        if (format !== "metta") {
          const errorInfo = extractErrorInfo(
            new AppError(
              `The "${format}" format is not supported yet. Please use MeTTa format for now.`,
              {
                severity: ErrorSeverity.WARNING,
                context: { tab: "text", format },
              }
            ),
            { displayTitle: "Format Not Supported" }
          );
          showToast(toToastOptions(errorInfo));
          return;
        }

        const cleanText = text.replace(/[\r\n]+/g, "\n").trim();
        const response = await uploadTextToSpace(spacePath, cleanText);

        setResult({ data: response, status: "success" });
        showToast({
          title: "Text Uploaded",
          description: `Text content was uploaded to "${spacePath}".`,
        });
        refreshSpace();
        break;
      }

      default:
        throw new AppError(`Invalid upload tab: "${currentTab}".`, {
          severity: ErrorSeverity.ERROR,
          context: { tab: currentTab, spacePath },
        });
    }
  } catch (error) {
    let displayTitle = "Upload Failed";
    let displayMessage = "An unexpected error occurred during upload.";

    if (error instanceof AppError) {
      displayMessage = error.message;
      displayTitle =
        error.severity === ErrorSeverity.WARNING
          ? "Input Error"
          : "Upload Failed";
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
        displayMessage = `Upload failed: ${error.message}`;
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    setResult({ error: errorMessage });

    const errorInfo = extractErrorInfo(error, {
      displayTitle,
      displayMessage,
      context: {
        tab: currentTab,
        spacePath,
        timestamp: new Date().toISOString(),
      },
    });

    showToast(toToastOptions(errorInfo));
  } finally {
    setIsLoading(false);
  }
};

export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const isFormValid = () => {
  switch (activeTab()) {
    case "url":
      return uri().trim() !== "";
    case "file":
      return selectedFile() !== null;
    case "text":
      return textContent().trim() !== "";
    default:
      return false;
  }
};
