import { createSignal } from "solid-js";
import { isPathClear, request } from "~/lib/api";
import { namespace } from "~/lib/state";
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
          title: "Intersection Completed",
          description: `Successfully computed intersection. Results written to "${spacePath}".`,
        });
        refreshSpace();
      }
    } catch (error) {
      const errorInfo = extractErrorInfo(error, {
        displayTitle: "Connection Lost",
        displayMessage: `Lost connection while monitoring intersection progress for "${spacePath}". The operation may still be running in the background.`,
        context: { spacePath, operation: "intersection-polling" },
      });
      showToast(toToastOptions(errorInfo));
      stopPolling();
    }
  }, 1000);
};

const toPath = (ns: string[]) => {
  const parts = ns.filter(Boolean);
  if (parts.length === 0) return "";
  const p = parts.join("/");
  return p.endsWith("/") ? p : `${p}/`;
};

export const executeIntersection = async (
  sources: string[][],
  target: string[]
) => {
  const current = (() => {
    const arr = namespace();
    const parts = arr.filter(Boolean);
    if (parts.length === 0) return "/"; // treat root as "/"
    const p = parts.join("/");
    return p.endsWith("/") ? p : `${p}/`;
  })();
  let src = sources
    .map(toPath)
    .map((s) => s || current)
    .filter(Boolean);
  const tgt = toPath(target) || current;

  // If user provided a single source, duplicate it: intersect(space, space) == space
  if (src.length === 1) src = [src[0], src[0]];

  if (src.length < 2) {
    const errorInfo = extractErrorInfo(
      new AppError(
        `Intersection requires at least two source namespaces to compute common data. You have provided ${src.length}.`,
        { severity: ErrorSeverity.WARNING }
      ),
      { displayTitle: "Invalid Input" }
    );
    showToast(toToastOptions(errorInfo));
    return;
  }

  if (!tgt) {
    const errorInfo = extractErrorInfo(
      new AppError(
        "Please specify a target namespace where the intersection results wlil be stored.",
        { severity: ErrorSeverity.WARNING }
      ),
      { displayTitle: "Missing Target" }
    );
    showToast(toToastOptions(errorInfo));
  }

  setIsLoading(true);
  stopPolling();

  try {
    if (!(await isPathClear(tgt))) {
      const errorInfo = extractErrorInfo(
        new AppError(
          `Space "${tgt}" is currently busy with another operation. Please wait for it to complete before starting intersection.`,
          {
            severity: ErrorSeverity.WARNING,
            context: { spacePath: tgt, sourceCount: src.length },
          }
        ),
        { displayTitle: "Space Busy" }
      );
      showToast(toToastOptions(errorInfo));
      setIsLoading(false);
      return;
    }

    //TODO: should implement api in api.ts
    const ok = await request<boolean>("/spaces/intersection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: src, target: [tgt] }),
    });

    if (ok) {
      showToast({
        title: "Intersection Initiated",
        description: `Computing intersection of ${src.length} source(s) into "${tgt}". This may take a moment...`,
      });
      startPolling(tgt);
    } else {
      throw new AppError(
        `Failed to start intersection into "${tgt}". ` +
          `The server may be unavailable, or one of the source namespaces may be invalid.`,
        {
          severity: ErrorSeverity.ERROR,
          context: {
            spacePath: tgt,
            sources: src,
            sourceCount: src.length,
          },
        }
      );
    }
  } catch (error) {
    let displayTitle = "Intersection Failed";
    let displayMessage =
      "An unexpected error occurred while computing the intersection.";
    if (error instanceof AppError) {
      displayMessage = error.message;
      displayTitle =
        error.severity === ErrorSeverity.WARNING
          ? "Input Error"
          : "Intersection Failed";
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
        displayMessage = `Intersection failed: ${error.message}`;
      }
    }
    const errorInfo = extractErrorInfo(error, {
      displayTitle,
      displayMessage,
      context: {
        spacePath: tgt,
        sources: src,
        sourceCount: src.length,
        timestamp: new Date().toISOString(),
      },
    });
    showToast(toToastOptions(errorInfo));
  } finally {
    setIsLoading(false);
  }
};
