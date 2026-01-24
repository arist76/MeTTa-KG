import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { importData, uploadTextToSpace, importSpace } from "~/lib/api";
import { refreshSpace } from "../load/lib";

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
        if (urlFormat() !== "metta" && urlFormat() !== "json") {
          showToast({
            title: "Format Not Supported Yet",
            description: `${urlFormat()} format not supported yet. Please use metta or json format.`,
            variant: "destructive",
          });
          return;
        }

        if (urlFormat() === "json") {
          try {
            const response = await fetch(uri());
            if (!response.ok) throw new Error("Failed to fetch JSON from URL");
            const jsonText = await response.text();
            const file = new File([jsonText], "imported.json", {
              type: "application/json",
            });
            const formData = new FormData();
            formData.append("file", file);

            const importResponse = await importData(
              "file",
              formData,
              "json",
              spacePath
            );

            if (importResponse.status === "success") {
              setResult({ data: importResponse.data, status: "success" });
              showToast({
                title: "Import Successful",
                description: `JSON data was imported from "${uri()}".`,
              });
              setTimeout(() => refreshSpace(), 1000);
            } else {
              setResult({ error: importResponse.message });
              showToast({
                title: "Import Failed",
                description: importResponse.message,
                variant: "destructive",
              });
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error
                ? error.message
                : "Failed to fetch or process JSON from URL";
            setResult({ error: errorMessage });
            showToast({
              title: "Import Failed",
              description: errorMessage,
              variant: "destructive",
            });
          }
          break;
        }

        const response = await importSpace(spacePath, uri());

        if (response) {
          setResult("Successfully imported to space");
          showToast({
            title: "Import Successful",
            description: `Data was imported from "${uri()}".`,
          });
          setTimeout(() => refreshSpace(), 1000);
        } else {
          setResult({ error: "Error importing to space" });
          showToast({
            title: "Import Failed",
            description: "Could not import from URL.",
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
            title: "File Uploaded",
            description: `File "${fileState.name}" uploaded.`,
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

        if (textFormat() !== "metta" && textFormat() !== "json") {
          showToast({
            title: "Format Not Supported Yet",
            description: `${textFormat()} format not supported yet. Please use metta or json format.`,
            variant: "destructive",
          });
          return;
        }

        if (textFormat() === "json") {
          const file = new File([textContent()], "pasted.json", {
            type: "application/json",
          });
          const formData = new FormData();
          formData.append("file", file);

          const response = await importData(
            "file",
            formData,
            "json",
            spacePath
          );

          if (response.status === "success") {
            setResult({ data: response.data, status: "success" });
            showToast({
              title: "Text Uploaded",
              description: `JSON text was uploaded to the "${spacePath}" space.`,
            });
            refreshSpace();
          } else {
            setResult({ error: response.message });
            showToast({
              title: "Upload Failed",
              description: response.message,
              variant: "destructive",
            });
          }
          break;
        }

        const cleanText = textContent()
          .replace(/[\r\n]+/g, "\n")
          .trim();
        const response = await uploadTextToSpace(spacePath, cleanText);
        setResult({ data: response, status: "success" });
        showToast({
          title: "Text Uploaded",
          description: `Text was uploaded to the "${spacePath}" space.`,
        });
        refreshSpace();
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
