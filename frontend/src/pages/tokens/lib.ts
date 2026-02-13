import { createResource, createSignal, createMemo, createRoot } from "solid-js";
import {
  fetchTokens,
  refreshCodes,
  deleteTokens,
  deleteToken,
} from "~/lib/api";
import { Token } from "~/lib/types";
import { showToast } from "~/components/ui/Toast";
import { rootToken, setRootToken, isConfigured } from "~/lib/state";
import {
  AppError,
  ErrorSeverity,
  extractErrorInfo,
  toToastOptions,
} from "~/lib/error";

export enum SortableColumns {
  TIMESTAMP,
  NAMESPACE,
  READ,
  WRITE,
  SHARE_READ,
  SHARE_WRITE,
  SHARE_SHARE,
}

import { setNamespace, setTokenRootNamespace } from "~/lib/state";

export const [tokens, { mutate: mutateTokens, refetch: refetchTokens }] =
  createRoot(() =>
    createResource(
      () => (rootToken() ? rootToken() : null),
      async (token) => {
        try {
          const fetchedTokens = await fetchTokens(token);

          const currentToken = fetchedTokens.find((t) => t.code === token);
          if (currentToken) {
            const namespaceParts = currentToken.namespace
              .split("/")
              .filter((part) => part.length > 0);
            const rootNs = ["", ...namespaceParts];

            localStorage.setItem("tokenNamespace", JSON.stringify(rootNs));

            setTokenRootNamespace(rootNs);
            setNamespace(rootNs);
          }
          showToast({
            title: "Success",
            description: `Loaded ${fetchedTokens.length} tokens.`,
          });
          return fetchedTokens;
        } catch (e) {
          let displayTitle = "Failed to Load Tokens";
          let displayMessage =
            "An unexpected error occurred while loading tokens.";

          if (e instanceof Error && e.message.includes("Unauthorized")) {
            setRootToken(null);
            localStorage.removeItem("rootToken");
            displayTitle = "Authentication Failed";
            displayMessage = "Your session has expired. Please log in again.";
          } else if (e instanceof AppError) {
            displayMessage = e.message;
            displayTitle =
              e.severity === ErrorSeverity.WARNING
                ? "Input Error"
                : "Failed to Load Tokens";
          } else if (e instanceof Error) {
            if (e.message.includes("fetch") || e.message.includes("network")) {
              displayTitle = "Connection Error";
              displayMessage =
                "Could not connect to the server. Please verify the MORK server is running.";
            } else {
              displayMessage = `Failed to load tokens: ${e.message}`;
            }
          }

          const errorMsg = e instanceof Error ? e.message : String(e);
          if (!errorMsg.includes("404") || isConfigured()) {
            const errorInfo = extractErrorInfo(e, {
              displayTitle,
              displayMessage,
              context: { action: "fetch", timestamp: new Date().toISOString() },
            });
            showToast(toToastOptions(errorInfo));
          }
          return [];
        }
      },
      { initialValue: [] }
    )
  );

export const [selectedTokens, setSelectedTokens] = createSignal<Token[]>([]);
export const [sortColumn, setSortColumn] = createSignal<SortableColumns>(
  SortableColumns.TIMESTAMP
);
export const [sortDirection, setSortDirection] = createSignal<"asc" | "desc">(
  "desc"
);
export const [namespaceFilter, setNamespaceFilter] = createSignal("");
export const [descriptionFilter, setDescriptionFilter] = createSignal("");

export const filteredAndSortedTokens = createRoot(() =>
  createMemo(() => {
    const nsRegex = new RegExp(namespaceFilter(), "i");
    const descRegex = new RegExp(descriptionFilter(), "i");
    return tokens()
      .filter((t) => nsRegex.test(t.namespace) && descRegex.test(t.description))
      .sort((a, b) => {
        let result = 0;
        switch (sortColumn()) {
          case SortableColumns.TIMESTAMP:
            result =
              Date.parse(a.creation_timestamp) -
              Date.parse(b.creation_timestamp);
            break;
          case SortableColumns.NAMESPACE:
            result = a.namespace.localeCompare(b.namespace);
            break;
        }
        return sortDirection() === "desc" ? -result : result;
      });
  })
);

export const handleSort = (column: SortableColumns) => {
  if (sortColumn() === column) {
    setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
  } else {
    setSortColumn(column);
    setSortDirection("desc");
  }
};

export const handleRefresh = async () => {
  const root = rootToken();
  if (!root || selectedTokens().length === 0) return;
  try {
    const refreshed = await refreshCodes(
      root,
      selectedTokens().map((t) => t.id)
    );

    const idsRefreshed = refreshed.map((t) => t.id);
    mutateTokens((current) => [
      ...(current?.filter((t) => !idsRefreshed.includes(t.id)) || []),
      ...refreshed,
    ]);

    showToast({
      title: "Tokens Refreshed",
      description: `${refreshed.length} token(s) have new codes.`,
    });
    setSelectedTokens([]);
  } catch (e) {
    let displayTitle = "Refresh Failed";
    let displayMessage =
      "An unexpected error occurred while refreshing token codes.";

    if (e instanceof AppError) {
      displayMessage = e.message;
      displayTitle =
        e.severity === ErrorSeverity.WARNING ? "Input Error" : "Refresh Failed";
    } else if (e instanceof Error) {
      if (e.message.includes("fetch") || e.message.includes("network")) {
        displayTitle = "Connection Error";
        displayMessage =
          "Could not connect to the server. Please verify the MORK server is running.";
      } else {
        displayMessage = `Failed to refresh tokens: ${e.message}`;
      }
    }

    const errorInfo = extractErrorInfo(e, {
      displayTitle,
      displayMessage,
      context: {
        action: "refresh",
        count: selectedTokens().length,
        timestamp: new Date().toISOString(),
      },
    });
    showToast(toToastOptions(errorInfo));
  }
};

export const handleDelete = async () => {
  const root = rootToken();
  if (!root || selectedTokens().length === 0) return;

  try {
    const selected = selectedTokens();
    const idsToDelete = selected.map((t) => t.id);

    if (selected.length === 1) {
      await deleteToken(root, selected[0].id);
    } else {
      await deleteTokens(root, idsToDelete);
    }

    await refetchTokens();

    showToast({
      title: "Tokens Deleted",
      description: `${idsToDelete.length} token(s) and their children removed.`,
    });
    setSelectedTokens([]);
  } catch (e) {
    let displayTitle = "Delete Failed";
    let displayMessage = "An unexpected error occurred while deleting tokens.";

    if (e instanceof AppError) {
      displayMessage = e.message;
      displayTitle =
        e.severity === ErrorSeverity.WARNING ? "Input Error" : "Delete Failed";
    } else if (e instanceof Error) {
      if (e.message.includes("fetch") || e.message.includes("network")) {
        displayTitle = "Connection Error";
        displayMessage =
          "Could not connect to the server. Please verify the MORK server is running.";
      } else {
        displayMessage = `Failed to delete tokens: ${e.message}`;
      }
    }

    const errorInfo = extractErrorInfo(e, {
      displayTitle,
      displayMessage,
      context: {
        action: "delete",
        count: selectedTokens().length,
        timestamp: new Date().toISOString(),
      },
    });
    showToast(toToastOptions(errorInfo));
  }
};

export const handleSelectAll = (checked: boolean) => {
  setSelectedTokens(checked ? [...filteredAndSortedTokens()] : []);
};

export const handleSelectToken = (token: Token, checked: boolean) => {
  setSelectedTokens((prev) =>
    checked ? [...prev, token] : prev.filter((t) => t.id !== token.id)
  );
};

export const isTokenSelected = (token: Token) =>
  selectedTokens().some((t) => t.id === token.id);
