import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { API_URL } from "./api";

export type CommandType =
  | "IMPORT"
  | "EXPORT"
  | "UNION"
  | "TRANSFORM"
  | "COMPOSITION"
  | "INTERSECTION"
  | "CLEAR"
  | "UPLOAD"
  | "UNKNOWN"
  | null;

export const [activeCommand, setActiveCommand] =
  createSignal<CommandType>(null);
export const [commandProgress, setCommandProgress] = createSignal(0);
export const [commandLogs, setCommandLogs] = createSignal<string[]>([]);

export const isCommandActive = (type: CommandType) => activeCommand() === type;
export const isAnyCommandActive = () => activeCommand() !== null;
export const isCommandRunning = isAnyCommandActive;
export const isCommandQueued = (type: CommandType) =>
  isCommandActive(type) &&
  commandLogs().some((line) => line.includes("waiting for turn"));

let eventSource: EventSource | null = null;
let lastErrorToastAt = 0;
let commandResetTimeout: ReturnType<typeof setTimeout> | null = null;

export const initSSE = () => {
  if (
    eventSource &&
    (eventSource.readyState === 0 || eventSource.readyState === 1)
  ) {
    return;
  }

  // Close any existing potentially closed/broken connection before making a new one
  if (eventSource) {
    eventSource.close();
  }

  // Use API_URL to construct the full URL for the events endpoint
  const eventsUrl = new URL("/events", API_URL).toString();
  eventSource = new EventSource(eventsUrl);

  eventSource.onmessage = (event) => {
    if (commandResetTimeout) {
      clearTimeout(commandResetTimeout);
      commandResetTimeout = null;
    }

    const data = event.data;

    if (data.startsWith("PROCESS_STARTED")) {
      const parts = data.split(":");
      const commandType =
        parts.length > 1 ? (parts[1] as CommandType) : "UNKNOWN";
      setActiveCommand(commandType);
      setCommandProgress(0);
      setCommandLogs([]);
      return;
    }

    if (data.startsWith("PROCESS_EXIT_SUCCESS")) {
      const parts = data.split(":");
      const cmdName =
        parts.length > 1 ? (parts[1] as CommandType) : activeCommand();
      if (activeCommand() === cmdName) {
        setCommandProgress(100);
        setActiveCommand(null);
      }
      showToast({
        title: "Success",
        description: `${cmdName} completed successfully`,
      });
      return;
    }

    if (data.startsWith("PROCESS_EXIT_ERROR")) {
      const parts = data.split(":");
      const cmdName =
        parts.length > 1 ? (parts[1] as CommandType) : activeCommand();
      if (activeCommand() === cmdName) {
        setActiveCommand(null);
      }
      showToast({
        title: "Error",
        description: `${cmdName} failed`,
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
      return prev + 10;
    });
  };

  eventSource.onerror = () => {
    const now = Date.now();
    if (now - lastErrorToastAt > 10000) {
      lastErrorToastAt = now;
      showToast({
        title: "Error",
        description: `Error in SSE connection, attempting to reconnect...`,
        variant: "destructive",
      });
    }

    if (eventSource?.readyState === EventSource.CLOSED) {
      if (commandResetTimeout) {
        clearTimeout(commandResetTimeout);
        commandResetTimeout = null;
      }
      if (activeCommand()) {
        setActiveCommand(null);
        setCommandProgress(0);
      }
      return;
    }

    if (activeCommand() && !commandResetTimeout) {
      commandResetTimeout = setTimeout(() => {
        if (activeCommand()) {
          setActiveCommand(null);
          setCommandProgress(0);
        }
        commandResetTimeout = null;
      }, 15000);
    }
    // EventSource will attempt to reconnect automatically
  };
};
