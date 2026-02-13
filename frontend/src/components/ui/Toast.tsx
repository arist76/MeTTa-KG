import { createSignal, For, Show, createEffect } from "solid-js";
import { Portal } from "solid-js/web";
import X from "lucide-solid/icons/x";
import AlertTriangle from "lucide-solid/icons/alert-triangle";
import MessageSquare from "lucide-solid/icons/message-square";
import Hash from "lucide-solid/icons/hash";
import Tag from "lucide-solid/icons/tag";
import Clock from "lucide-solid/icons/clock";
import ClipboardList from "lucide-solid/icons/clipboard-list";
import Copy from "lucide-solid/icons/copy";
import Code from "lucide-solid/icons/code";
import Check from "lucide-solid/icons/check";
import ExternalLink from "lucide-solid/icons/external-link";
import type { ErrorDetails } from "~/lib/error";

type ToastVariant = "default" | "warning" | "destructive";

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  details?: ErrorDetails;
}

interface ToastData extends ToastOptions {
  id: number;
  timerId?: ReturnType<typeof setTimeout>;
}

let toastId = 0;
const [toasts, setToasts] = createSignal<ToastData[]>([]);
const [activeModal, setActiveModal] = createSignal<ToastData | null>(null);
const [copiedId, setCopiedId] = createSignal<string | null>(null);

export function showToast(options: ToastOptions) {
  const id = ++toastId;
  const duration = options.duration ?? 5000;

  const timerId = setTimeout(() => removeToast(id), duration);
  setToasts((prev) => [...prev, { ...options, id, timerId }]);
}

export function removeToast(id: number) {
  setToasts((prev) => {
    const toastToRemove = prev.find((t) => t.id === id);
    if (toastToRemove?.timerId) {
      clearTimeout(toastToRemove.timerId);
    }
    if (activeModal()?.id === id) {
      setActiveModal(null);
    }
    return prev.filter((t) => t.id !== id);
  });
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function getStatusColor(statusCode: number): string {
  if (statusCode >= 500)
    return "bg-destructive/20 text-destructive border-destructive/30";
  if (statusCode >= 400)
    return "bg-orange-500/20 text-orange-600 border-orange-500/30 dark:text-orange-400";
  if (statusCode >= 300)
    return "bg-blue-500/20 text-blue-600 border-blue-500/30 dark:text-blue-400";
  return "bg-green-500/20 text-green-600 border-green-500/30 dark:text-green-400";
}

async function copyToClipboard(text: string, id: string) {
  try {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}

function ErrorDetailsModal(props: { toast: ToastData; onClose: () => void }) {
  const [showHtml, setShowHtml] = createSignal(false);
  const [showFullContext, setShowFullContext] = createSignal(false);

  const details = () => props.toast.details!;

  const responseHtml = () => {
    const ctx = details().context;
    return ctx?.responseHtml as string | undefined;
  };

  const formattedContext = () => {
    const ctx = details().context;
    if (!ctx) return [];
    return Object.entries(ctx).filter(([key]) => key !== "responseHtml");
  };

  const errorReport = () => {
    return `
## Error Report

**Message:** ${details().originalMessage}

**Type:** ${details().errorType}
**Status Code:** ${details().statusCode || "N/A"}
**Time:** ${details().context?.timestamp || new Date().toISOString()}

### Context
${JSON.stringify(details().context, null, 2)}
    `.trim();
  };

  const isDestructive = () => props.toast.variant === "destructive";
  const isWarning = () => props.toast.variant === "warning";

  createEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  });

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-border">
          {/* Modal Header */}
          <div
            class={`px-6 py-4 border-b flex items-center justify-between ${
              isDestructive()
                ? "bg-destructive/10 border-destructive/20"
                : isWarning()
                  ? "bg-yellow-500/10 border-yellow-500/20"
                  : "bg-muted border-border"
            }`}
          >
            <div class="flex items-center gap-3">
              <div
                class={`p-2 rounded-lg ${
                  isDestructive()
                    ? "bg-destructive/20 text-destructive"
                    : isWarning()
                      ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                      : "bg-primary/20 text-primary"
                }`}
              >
                <AlertTriangle class="h-6 w-6" />
              </div>
              <div>
                <h2 class="text-xl font-bold text-foreground">Error Details</h2>
                <p class="text-sm text-muted-foreground">
                  {props.toast.title || "An error occurred"}
                </p>
              </div>
            </div>
            <button
              onClick={props.onClose}
              class="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <X class="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Modal Body */}
          <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
            {/* Error Message Section */}
            <div class="bg-destructive/10 border border-destructive/20 rounded-xl p-5">
              <div class="flex items-center gap-2 mb-3 text-destructive">
                <MessageSquare class="h-5 w-5" />
                <span class="text-sm font-bold uppercase tracking-wide">
                  Error Message
                </span>
              </div>
              <p class="text-base leading-relaxed text-foreground font-medium">
                {details().originalMessage}
              </p>
            </div>

            {/* Technical Details Grid */}
            <div class="grid grid-cols-2 gap-4">
              {/* Status Code */}
              <Show when={details().statusCode}>
                <div class="bg-muted rounded-xl p-4 border border-border">
                  <div class="flex items-center gap-2 mb-2 text-muted-foreground">
                    <Hash class="h-4 w-4" />
                    <span class="text-xs font-bold uppercase tracking-wider">
                      Status Code
                    </span>
                  </div>
                  <span
                    class={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold border ${getStatusColor(
                      details().statusCode!
                    )}`}
                  >
                    {details().statusCode}
                  </span>
                </div>
              </Show>

              {/* Error Type */}
              <div class="bg-muted rounded-xl p-4 border border-border">
                <div class="flex items-center gap-2 mb-2 text-muted-foreground">
                  <Tag class="h-4 w-4" />
                  <span class="text-xs font-bold uppercase tracking-wider">
                    Error Type
                  </span>
                </div>
                <span class="text-base font-semibold text-foreground">
                  {details().errorType}
                </span>
              </div>

              {/* Timestamp */}
              <Show when={details().context?.timestamp}>
                <div class="bg-muted rounded-xl p-4 border border-border col-span-2">
                  <div class="flex items-center gap-2 mb-2 text-muted-foreground">
                    <Clock class="h-4 w-4" />
                    <span class="text-xs font-bold uppercase tracking-wider">
                      Time
                    </span>
                  </div>
                  <span class="text-base text-foreground">
                    {formatTimestamp(details().context!.timestamp as string)}
                  </span>
                </div>
              </Show>
            </div>

            {/* Context Section */}
            <Show when={formattedContext().length > 0}>
              <div class="bg-muted/50 rounded-xl p-5 border border-border">
                <div class="flex items-center justify-between mb-4">
                  <div class="flex items-center gap-2 text-foreground">
                    <ClipboardList class="h-5 w-5" />
                    <span class="text-sm font-bold uppercase tracking-wide">
                      Additional Context
                    </span>
                  </div>
                  <button
                    onClick={() => setShowFullContext(!showFullContext())}
                    class="text-sm text-primary hover:underline font-medium"
                  >
                    {showFullContext() ? "Show Less" : "Show All"}
                  </button>
                </div>
                <div class="space-y-3">
                  <For
                    each={formattedContext().slice(
                      0,
                      showFullContext() ? undefined : 5
                    )}
                  >
                    {([key, value]) => (
                      <div class="group flex items-start gap-3 p-3 bg-background rounded-lg border border-border hover:border-primary/50 transition-colors">
                        <span class="text-sm font-bold text-muted-foreground min-w-[100px] shrink-0">
                          {key}
                        </span>
                        <span class="text-sm text-foreground break-all font-mono bg-muted px-2 py-1 rounded flex-1">
                          {String(value).substring(0, 150)}
                          {String(value).length > 150 ? "..." : ""}
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(String(value), `modal-${key}`)
                          }
                          class="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded"
                          title="Copy value"
                        >
                          {copiedId() === `modal-${key}` ? (
                            <Check class="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy class="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* HTML Response Section */}
            <Show when={responseHtml()}>
              <div class="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowHtml(!showHtml())}
                  class="w-full flex items-center justify-between p-4 bg-muted hover:bg-muted/80 transition-colors"
                >
                  <div class="flex items-center gap-2 text-foreground">
                    <Code class="h-5 w-5" />
                    <span class="text-sm font-bold">Raw Response HTML</span>
                  </div>
                  <span class="text-sm text-muted-foreground">
                    {showHtml() ? "Hide" : "Show"}
                  </span>
                </button>
                <Show when={showHtml()}>
                  <div class="p-4 bg-black">
                    <pre class="text-xs text-gray-300 overflow-auto max-h-64 whitespace-pre-wrap break-all font-mono">
                      {responseHtml()}
                    </pre>
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          {/* Modal Footer */}
          <div class="px-6 py-4 border-t border-border bg-muted flex items-center justify-between">
            <button
              onClick={() =>
                copyToClipboard(errorReport(), `report-${props.toast.id}`)
              }
              class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-background border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
            >
              {copiedId() === `report-${props.toast.id}` ? (
                <>
                  <Check class="h-4 w-4 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy class="h-4 w-4" />
                  Copy Error Report
                </>
              )}
            </button>
            <button
              onClick={props.onClose}
              class="px-4 py-2 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function ToastViewport() {
  return (
    <Portal>
      {/* Toast Container */}
      <div class="fixed z-[9999] bottom-0 right-0 flex flex-col gap-3 p-4 w-full md:max-w-md">
        <For each={toasts()}>
          {(toast) => {
            const isDestructive = toast.variant === "destructive";
            const isWarning = toast.variant === "warning";
            const emoji = isDestructive ? "🔥" : isWarning ? "⚠️" : "✨";

            const openModal = () => {
              // Pause toast timer when modal opens
              if (toast.timerId) {
                clearTimeout(toast.timerId);
                setToasts((prev) =>
                  prev.map((t) =>
                    t.id === toast.id ? { ...t, timerId: undefined } : t
                  )
                );
              }
              setActiveModal(toast);
            };

            const closeModal = () => {
              setActiveModal(null);
              // Resume toast timer when modal closes
              const newTimerId = setTimeout(
                () => removeToast(toast.id),
                toast.duration ?? 5000
              );
              setToasts((prev) =>
                prev.map((t) =>
                  t.id === toast.id ? { ...t, timerId: newTimerId } : t
                )
              );
            };

            return (
              <>
                <div
                  class={`group pointer-events-auto relative flex w-full items-start space-x-3 overflow-hidden rounded-xl border p-4 pr-8 shadow-lg transition-all
                  ${
                    isDestructive
                      ? "border-destructive/50 bg-destructive/10 text-destructive"
                      : isWarning
                        ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                        : "border-border bg-background text-foreground"
                  }`}
                >
                  <div class="flex-shrink-0 text-2xl mt-0.5">{emoji}</div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <Show when={toast.title}>
                        <div class="text-sm font-bold truncate text-foreground">
                          {toast.title}
                        </div>
                      </Show>
                    </div>

                    <Show when={toast.description}>
                      <div class="text-sm mt-1 opacity-90 text-foreground">
                        {toast.description}
                      </div>
                    </Show>

                    {/* View Details Button */}
                    <Show when={toast.details}>
                      <button
                        onClick={openModal}
                        class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 hover:underline"
                      >
                        <ExternalLink class="h-3 w-3" />
                        View Details
                      </button>
                    </Show>
                  </div>

                  <button
                    class="absolute right-2 top-2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
                    onClick={() => removeToast(toast.id)}
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>

                {/* Modal */}
                <Show when={activeModal()?.id === toast.id}>
                  <ErrorDetailsModal toast={toast} onClose={closeModal} />
                </Show>
              </>
            );
          }}
        </For>
      </div>
    </Portal>
  );
}
