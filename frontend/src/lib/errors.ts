import { showToast } from "~/components/ui/Toast";

export function reportError(context: string, error: unknown, title = "Error") {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  showToast({ title, description: message, variant: "destructive" });
  console.error(`[${context}]`, error);
}
