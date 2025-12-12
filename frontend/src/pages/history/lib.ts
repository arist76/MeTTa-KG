import { createStore } from "solid-js/store";
import { createUniqueId } from "solid-js";

export interface HistoryItem {
  id: string;
  timestamp: number;
  command: "Clear" | "Composition" | "Export" | "Transform" | "Union";
  pattern?: string;
  template?: string;
  details?: string;
}

const [history, setHistory] = createStore<HistoryItem[]>([]);

export const addToHistory = (item: Omit<HistoryItem, "id" | "timestamp">) => {
  setHistory((prev) => [
    { ...item, id: createUniqueId(), timestamp: Date.now() },
    ...prev,
  ]);
};

export { history };
