import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { importData, uploadTextToSpace, importSpace } from "~/lib/api";
import { isCommandRunning } from "~/lib/sse";
import { refreshSpace } from "../load/lib";
import { ref } from "process";

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
export { isCommandRunning as isLoading };
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
  setResult(null);

  try {
    switch (activeTab()) {
      case "url": {
        if (!uri().trim()) {
          showToast({
            title: "Missing URL",
            description: "Please enter a valid URL.",
            variant: "destructive",
          });
          return;
        }
        if (urlFormat() !== "metta") {
          showToast({
            title: "Format Not Supported Yet",
            description: `${urlFormat()} format not supported yet. Please use metta format.`,
            variant: "destructive",
          });
          return;
        }
        const response = await importSpace(spacePath, uri());

        if (response) {
          setResult("Import initiated successfully");
          showToast({
            title: "Import Started",
            description: `Data import from "${uri()}" has started.`,
          });

          setTimeout(() => refreshSpace(), 3000);
        } else {
          setResult({ error: "Error initiating import" });
          showToast({
            title: "Import Failed",
            description: "Could not initiate import.",
            variant: "destructive",
          });
        }
        break;
      }

      case "file": {
        const fileState = selectedFile();
        if (!fileState) {
          showToast({
            title: "No File Selected",
            description: "Please select a file.",
            variant: "destructive",
          });
          return;
        }
        const formData = new FormData();
        formData.append(
          "file",
          new File([fileState.content], fileState.name, {
            type: fileState.type,
          })
        );

        const response = await importData(
          "file",
          formData,
          fileFormat(),
          spacePath
        );
        if (response.status === "success") {
          setResult({ data: response.data, status: "success" });
          showToast({
            title: "File Upload Started",
            description: `File "${fileState.name}" upload started.`,
          });
          refreshSpace();
        } else {
          setResult({ error: response.message });
          showToast({
            title: "File Upload Failed",
            description: response.message,
            variant: "destructive",
          });
        }
        break;
      }

      case "text": {
        if (!textContent().trim()) {
          showToast({
            title: "Missing Text",
            description: "Please enter text to upload.",
            variant: "destructive",
          });
          return;
        }

        if (textFormat() !== "metta") {
          showToast({
            title: "Format Not Supported Yet",
            description: `${textFormat()} format not supported yet. Please use metta format.`,
            variant: "destructive",
          });
          return;
        }

        const cleanText = textContent()
          .replace(/[\r\n]+/g, "\n")
          .trim();

        await uploadTextToSpace(spacePath, cleanText);

        setResult({ data: "Upload initiated", status: "success" });
        showToast({
          title: "Text Upload Started",
          description: `Text upload to "${spacePath}" started.`,
        });
        break;
      }

      default:
        throw new Error("Invalid tab selection");
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    setResult({ error: errorMessage });
    showToast({
      title: "Operation Failed",
      description: errorMessage,
      variant: "destructive",
    });
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
