import { createMemo, createSignal } from "solid-js";

const [rootToken, _setRootToken] = createSignal<string | null>(
  localStorage.getItem("rootToken")
);

// Initialize from localStorage
const storedNamespace = localStorage.getItem("tokenNamespace");
const initialNamespace = storedNamespace ? JSON.parse(storedNamespace) : [""];

const [tokenRootNamespace, setTokenRootNamespace] =
  createSignal<string[]>(initialNamespace);
const [namespace, setNamespace] = createSignal<string[]>(initialNamespace);

export {
  rootToken,
  tokenRootNamespace,
  namespace,
  setNamespace,
  setTokenRootNamespace,
};

export const setRootToken = (token: string | null) => {
  localStorage.setItem("rootToken", token ?? "");
  _setRootToken(token);

  if (!token) {
    localStorage.removeItem("tokenNamespace");
    setTokenRootNamespace([""]);
    setNamespace([""]);
  }
};

export const formatedNamespace = createMemo(() => {
  if (namespace().length <= 1) return "/";
  return namespace().join("/");
});

export interface TabInfo {
  id: string;
  label: string;
}

export const [tabs, setTabs] = createSignal<TabInfo[]>([
  { id: "main", label: "Root" }
]);
export const [activeTabId, setActiveTabId] = createSignal<string>("main");

export const addTab = (ns: string[]) => {
  const newId = Math.random().toString(36).substring(7);
  const label = ns.length <= 1 || ns[ns.length - 1] === "" ? "Root" : ns[ns.length - 1];
  setTabs([...tabs(), { id: newId, label }]);
  setActiveTabId(newId);
};

export const closeTab = (tabId: string) => {
  const currentTabs = tabs();
  if (currentTabs.length <= 1) return;
  
  const index = currentTabs.findIndex(t => t.id === tabId);
  if (index === -1) return;
  
  const newTabs = currentTabs.filter(t => t.id !== tabId);
  setTabs(newTabs);
  
  if (activeTabId() === tabId) {
    const nextTab = newTabs[Math.max(0, index - 1)];
    setActiveTabId(nextTab.id);
  }
};
