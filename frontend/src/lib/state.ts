import { createMemo, createSignal, createRoot } from "solid-js";

const [rootToken, _setRootToken] = createSignal<string | null>(
  localStorage.getItem("rootToken")
);

export interface NamespaceTab {
  id: string;
  namespace: string[];
  label: string;
}

export interface AppConfig {
  apiBaseUrl: string;
  dbType: "sqlite" | "postgres" | null;
  isConfigured: boolean;
  isSetupServer: boolean;
  error?: string;
}

const storedNamespace = localStorage.getItem("tokenNamespace");
const initialNamespace = storedNamespace ? JSON.parse(storedNamespace) : [""];

const [tokenRootNamespace, setTokenRootNamespace] =
  createSignal<string[]>(initialNamespace);

const [forceUpdate, setForceUpdate] = createSignal(0);

const [tabs, setTabs] = createSignal<NamespaceTab[]>([
  {
    id: "default",
    namespace: initialNamespace,
    label:
      initialNamespace.length <= 1
        ? "Root"
        : initialNamespace.slice(-1)[0] || "Root",
  },
]);
const [activeTabId, _setActiveTabId] = createSignal("default");

const setActiveTabId = (id: string) => {
  _setActiveTabId(id);
  setForceUpdate((prev) => prev + 1);
};

const [namespace] = createRoot(() => {
  const memo = createMemo(() => {
    forceUpdate();
    const activeTab = tabs().find((tab) => tab.id === activeTabId());
    return activeTab?.namespace || [""];
  });

  return [memo];
});

// New signal for configuration status
const [isConfigured, setIsConfigured] = createSignal(false);

export {
  rootToken,
  tokenRootNamespace,
  namespace,
  tabs,
  activeTabId,
  setTokenRootNamespace,
  isConfigured,
  setTabs,
  setActiveTabId,
  setIsConfigured,
};

export const setRootToken = (token: string | null) => {
  localStorage.setItem("rootToken", token ?? "");
  _setRootToken(token);

  if (!token) {
    localStorage.removeItem("tokenNamespace");
    setTokenRootNamespace([""]);
    setTabs([
      {
        id: "default",
        namespace: [""],
        label: "Root",
      },
    ]);
    setActiveTabId("default");
  }
};

export const formatedNamespace = createMemo(() => {
  if (namespace().length <= 1) return "/";
  return namespace().join("/");
});

export const initializeConfig = async (): Promise<AppConfig> => {
  const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

  try {
    const buildInfoRes = await fetch(`${apiBaseUrl}/api/build-info`, {
      cache: "no-store",
    });

    if (!buildInfoRes.ok) {
      return {
        apiBaseUrl,
        dbType: null,
        isConfigured: false,
        isSetupServer: false,
        error: "Backend unreachable",
      };
    }

    const buildInfo = await buildInfoRes.json();
    const dbType = buildInfo.db_type as "sqlite" | "postgres";

    if (dbType === "postgres") {
      setIsConfigured(true);
      localStorage.setItem("mettakg_configured", "true");
      return {
        apiBaseUrl,
        dbType,
        isConfigured: true,
        isSetupServer: false,
      };
    }

    try {
      const apiRes = await fetch(`${apiBaseUrl}/api/tokens`, {
        cache: "no-store",
      });

      const isConfigured = apiRes.status === 401;
      const isSetupServer = apiRes.status === 404;

      if (isConfigured) {
        setIsConfigured(true);
        localStorage.setItem("mettakg_configured", "true");
      }

      return {
        apiBaseUrl,
        dbType,
        isConfigured,
        isSetupServer,
      };
    } catch {
      return {
        apiBaseUrl,
        dbType,
        isConfigured: false,
        isSetupServer: false,
        error: "Setup server running, API not ready",
      };
    }
  } catch {
    return {
      apiBaseUrl,
      dbType: null,
      isConfigured: false,
      isSetupServer: false,
      error: "Failed to connect to backend",
    };
  }
};

export const pollUntillConfigured = async (
  onReady: () => void,
  onError: (msg: string) => void,
  maxAttempts = 60
): Promise<void> => {
  let attempts = 0;

  const check = async () => {
    attempts++;
    const config = await initializeConfig();
    if (config.isConfigured) {
      onReady();
      return;
    }
    if (attempts >= maxAttempts) {
      onError("Server failed to start within timeout");
      return;
    }

    setTimeout(check, 1000);
  };

  check();
};

export const addTab = (namespace: string[], label?: string) => {
  const id = `tab-${Date.now()}`;

  const validNamespace =
    namespace.length > 0 ? namespace : tokenRootNamespace();

  let tabLabel: string;

  if (label) {
    tabLabel = label;
  } else if (validNamespace.length > 1) {
    const nonEmptyParts = validNamespace.filter((part) => part !== "");
    tabLabel =
      nonEmptyParts.length > 0
        ? nonEmptyParts[nonEmptyParts.length - 1]
        : "Root";
  } else {
    tabLabel = "Root";
  }

  setTabs((prev) => [
    ...prev,
    {
      id,
      namespace: validNamespace,
      label: tabLabel,
    },
  ]);

  setTimeout(() => setActiveTabId(id), 0);

  return id;
};

export const closeTab = (tabId: string) => {
  setTabs((prev) => {
    const filtered = prev.filter((tab) => tab.id !== tabId);
    if (filtered.length === 0) {
      return [
        {
          id: "default",
          namespace: [""],
          label: "Root",
        },
      ];
    }
    return filtered;
  });

  if (activeTabId() === tabId) {
    const remainingTabs = tabs().filter((tab) => tab.id !== tabId);
    if (remainingTabs.length > 0) {
      setActiveTabId(remainingTabs[0].id);
    } else {
      setActiveTabId("default");
    }
  }
};

export const updateTabNamespace = (tabId: string, namespace: string[]) => {
  setTabs((prev) =>
    prev.map((tab) => {
      if (tab.id === tabId) {
        let tabLabel: string;

        if (namespace.length > 1) {
          const nonEmptyParts = namespace.filter((part) => part !== "");
          tabLabel =
            nonEmptyParts.length > 0
              ? nonEmptyParts[nonEmptyParts.length - 1]
              : "Root";
        } else {
          tabLabel = "Root";
        }

        return {
          ...tab,
          namespace,
          label: tabLabel,
        };
      }
      return tab;
    })
  );
};

export const setNamespace = (namespace: string[]) => {
  const currentTabId = activeTabId();
  updateTabNamespace(currentTabId, namespace);
};
