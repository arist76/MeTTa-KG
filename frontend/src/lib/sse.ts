import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { API_URL } from "./api";

export const [isCommandRunning, setIsCommandRunning] = createSignal(false);
export const [commandProgress, setCommandProgress] = createSignal(0);
export const [commandLogs, setCommandLogs] = createSignal<string[]>([]);

let eventSource: EventSource | null = null;

export const initSSE = () => {
  if (eventSource) return;

  // Use API_URL to construct the full URL for the events endpoint
  const eventsUrl = new URL("/events", API_URL).toString();
  eventSource = new EventSource(eventsUrl);

  eventSource.onopen = () => {
    console.log("SSE Connection Opened");
  };

  eventSource.onmessage = (event) => {
    console.log("SSE Message Received:", event.data);
    const data = event.data;

    if (data === "PROCESS_STARTED") {
      setIsCommandRunning(true);
      setCommandProgress(0);
      setCommandLogs([]);
      return;
    }

    if (data === "PROCESS_EXIT_SUCCESS") {
      setCommandProgress(100);
      setIsCommandRunning(false);
      showToast({
        title: "Success",
        description: "Command completed successfully",
      });
      return;
    }

    if (data === "PROCESS_EXIT_ERROR") {
      setIsCommandRunning(false);
      showToast({
        title: "Error",
        description: "Command failed",
        variant: "destructive",
      });
      return;
    }

    // Handle stdout/stderr
    // If the message is not a lifecycle event, treat it as log output
    setCommandLogs((prev) => [...prev, data]);

    // Increment progress (cap at 90%)
    // We use a functional update to ensure we're working with the latest value
    setCommandProgress((prev) => {
      if (prev >= 90) return prev;
      return prev + 5;
    });
  };

  eventSource.onerror = (err) => {
    console.error("SSE Error:", err);
    // EventSource will attempt to reconnect automatically
  };
};
