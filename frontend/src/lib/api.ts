import { rootToken } from "./state";
import {
  ImportDataResponse,
  Token,
  ExploreDetail,
  Mm2Input,
  Mm2InputMultiWithNamespace,
} from "./types";
import { CSVParserParameters } from "~/types";
import { quoteFromBytes, getHttpErrorMessage } from "./utils";
import { AppError, ErrorSeverity } from "./error";

export const API_URL =
  (window.location.origin || import.meta.env.VITE_BACKEND_URL) + "/api";

export interface ApiResponse {
  status: "success" | "error";
  data?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
  message: string;
}

export enum CSVParseDirection {
  Row = 1,
  Column = 2,
  CellUnlabeled = 3,
  CellLabeled = 4,
}

// export interface CSVParserParameters {
//   direction: CSVParseDirection;
//   delimiter: string;
// }

export async function request<T>(
  url: string,
  options: RequestInit = {},
  authOverride?: string | null
): Promise<T> {
  const auth = rootToken();

  // FIX: Ensure we don't strip the /api path.
  // If 'url' starts with '/', remove it to append cleanly to API_URL
  const cleanPath = url.startsWith("/") ? url.slice(1) : url;
  const finalUrl = `${API_URL}/${cleanPath}`;

  if (!auth) {
    throw new AppError(
      "No authentication token found. Please add a root token in the Tokens page.",
      {
        severity: ErrorSeverity.WARNING,
        context: { url: finalUrl, operation: "request" },
      }
    );
  }

  const headers = {
    ...options.headers,
    Authorization: authOverride || auth,
  };

  const response = await fetch(finalUrl, { ...options, headers });

  // if (!response.ok) {
  //   const contentType = response.headers.get("content-type");
  //   let errorMessage = response.statusText;
  //
  //   if (contentType && contentType.includes("application/json")) {
  //     try {
  //       const errorData = await response.json();
  //       errorMessage = errorData.message || errorData.error || errorMessage;
  //     } catch {
  //       // If JSON parsing fails, use statusText
  //     }
  //   } else {
  //     try {
  //       const errorText = await response.text();
  //       if (errorText) errorMessage = errorText;
  //     } catch {
  //       // If text parsing fails, use statusText
  //     }
  //   }
  //
  //   throw new AppError(errorMessage, {
  //     statusCode: response.status,
  //     severity:
  //       response.status >= 500 ? ErrorSeverity.ERROR : ErrorSeverity.WARNING,
  //     context: {
  //       url: finalUrl,
  //       method: options.method,
  //       shouldRetry: response.status >= 500 || response.status === 429,
  //     },
  //   });
  // }
  if (!response.ok) {
    const contentType = response.headers.get("content-type");
    let errorMessage = response.statusText;
    const errorContext: Record<string, unknown> = {
      url: finalUrl,
      method: options.method,
      shouldRetry: response.status >= 500 || response.status === 429,
    };
    // Check if response is HTML (common for server error pages)
    const isHtml = contentType?.includes("text/html");
    if (isHtml) {
      // Don't use HTML as error message - use clean status-based message
      const errorText = await response.text().catch(() => "");
      errorMessage = getHttpErrorMessage(response.status); // Clean message
      errorContext.responseHtml = errorText.substring(0, 1000); // Store HTML for debugging
    } else if (contentType?.includes("application/json")) {
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // If JSON parsing fails, use statusText
      }
    } else {
      try {
        const errorText = await response.text();
        if (errorText) errorMessage = errorText;
      } catch {
        // If text parsing fails, use statusText
      }
    }
    throw new AppError(errorMessage, {
      statusCode: response.status,
      severity:
        response.status >= 500 ? ErrorSeverity.ERROR : ErrorSeverity.WARNING,
      context: errorContext,
    });
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return (await response.json()) as T;
  } else {
    return (await response.text()) as T;
  }
}

export const transform = (
  input: Mm2InputMultiWithNamespace
): Promise<boolean> => {
  return request<boolean>("/spaces/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
};

export const union = (unification: Mm2Input) => {
  const patterns = Array.isArray(unification.pattern)
    ? unification.pattern
    : [unification.pattern];
  const templates = Array.isArray(unification.template)
    ? unification.template
    : [unification.template];

  return request<boolean>(`/spaces/union`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: patterns, target: templates }),
  })
    .then((result) => {
      return result;
    })
    .catch((error) => {
      throw error;
    });
};

export const composition = (compositionInput: {
  source: string[];
  target: string[];
}) => {
  return request<boolean>(`/spaces/composition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: compositionInput.source,
      target: compositionInput.target,
    }),
  })
    .then((result) => {
      return result;
    })
    .catch((error) => {
      throw error;
    });
};

export const readSpace = (path: string) => {
  return request<string>(`/spaces${path}`);
};

export const getAllTokens = () => {
  return request<Token[]>("/tokens");
};

export const getToken = () => {
  return request<Token>("/token");
};

export const createFromCSV = async (
  file: File,
  params: CSVParserParameters
): Promise<any> => {
  const formData = new FormData();
  formData.append("file", file);
  const url = new URL(`${API_URL}/translations/csv`);
  url.search = new URLSearchParams(
    params as any /* eslint-disable-line @typescript-eslint/no-explicit-any */
  ).toString();

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `${localStorage.getItem("rootToken")}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AppError(
        errorData.message || `CSV translation failed: ${response.statusText}`,
        {
          statusCode: response.status,
          severity: ErrorSeverity.ERROR,
          context: { operation: "createFromCSV", fileName: file.name },
        }
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Failed to process CSV file. Please check the file format.",
      {
        severity: ErrorSeverity.ERROR,
        context: { operation: "createFromCSV", fileName: file.name },
      }
    );
  }
};

export const createFromNT = async (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_URL}/translations/nt`, {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `${localStorage.getItem("rootToken")}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AppError(
        errorData.message ||
          `N-Triples translation failed: ${response.statusText}`,
        {
          statusCode: response.status,
          severity: ErrorSeverity.ERROR,
          context: { operation: "createFromNT", fileName: file.name },
        }
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Failed to process N-Triples file. Please check the file format.",
      {
        severity: ErrorSeverity.ERROR,
        context: { operation: "createFromNT", fileName: file.name },
      }
    );
  }
};

export const createFromJsonLd = async (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_URL}/translations/jsonld`, {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `${localStorage.getItem("rootToken")}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AppError(
        errorData.message ||
          `JSON-LD translation failed: ${response.statusText}`,
        {
          statusCode: response.status,
          severity: ErrorSeverity.ERROR,
          context: { operation: "createFromJsonLd", fileName: file.name },
        }
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Failed to process JSON-LD file. Please check the file format.",
      {
        severity: ErrorSeverity.ERROR,
        context: { operation: "createFromJsonLd", fileName: file.name },
      }
    );
  }
};

export const createFromN3 = async (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${API_URL}/translations/n3`, {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `${localStorage.getItem("rootToken")}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AppError(
        errorData.message || `N3 translation failed: ${response.statusText}`,
        {
          statusCode: response.status,
          severity: ErrorSeverity.ERROR,
          context: { operation: "createFromN3", fileName: file.name },
        }
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Failed to process N3 file. Please check the file format.",
      {
        severity: ErrorSeverity.ERROR,
        context: { operation: "createFromN3", fileName: file.name },
      }
    );
  }
};

export async function isPathClear(path: string): Promise<boolean> {
  try {
    const cleanPath = path.replace(/^\/+|\/+$/g, "");

    const requestBody = {
      pattern: "$x",
      token: "",
    };

    // TODO: use requests function and return value from it
    const _response = await fetch(`${API_URL}/spaces/explore${cleanPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    return true;
  } catch (error) {
    throw new AppError(`Failed to check if space "${path}" is ready.`, {
      severity: ErrorSeverity.ERROR,
      context: { operation: "isPathClear", path },
    });
  }
}

export async function importData(
  type: string,
  data: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ = null,
  format: string = "metta",
  path: string
): Promise<ImportDataResponse> {
  try {
    switch (type) {
      case "text": {
        const url = `${API_URL}/upload/${encodeURIComponent("$x")}/${encodeURIComponent("$x")}?format=${encodeURIComponent(format)}`;
        const text = await request<string>(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: data as string,
        });

        return {
          status: "success",
          data: text,
          message: "Text imported successfully",
        };
      }

      case "file":
        try {
          const file: File = data.get("file");

          if (!file) {
            throw new AppError("No file provided for upload.", {
              severity: ErrorSeverity.WARNING,
              context: { operation: "importData", type: "file", path },
            });
          }

          const text = await file.text();
          let contentType = "text/plain";
          if (format === "json") {
            contentType = "application/json";
          } else if (format === "csv") {
            contentType = "text/csv";
          }
          const resp = await request<string>(`/spaces/upload${path}`, {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: text,
          });

          return {
            status: "success",
            data: resp,
            message: "File imported successfully",
          };
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(
            err instanceof Error ? err.message : "Failed to upload file",
            {
              severity: ErrorSeverity.ERROR,
              context: { operation: "importData", type: "file", path },
            }
          );
        }

      default:
        throw new AppError(
          `Unsupported import type: "${type}". Supported types are "text" and "file".`,
          {
            severity: ErrorSeverity.WARNING,
            context: { operation: "importData", type, path },
          }
        );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      error instanceof Error ? error.message : "Failed to import data",
      {
        severity: ErrorSeverity.ERROR,
        context: { operation: "importData", type, path },
      }
    );
  }
}

export const uploadTextToSpace = (
  path: string,
  data: string
): Promise<string> => {
  return request<string>(`/spaces/upload${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data,
  });
};

export const importSpace = (path: string, uri: string) => {
  return request<boolean>(
    `/spaces/import/${path.replace(/^\/+/, "")}?uri=${encodeURIComponent(uri)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
};

export const fetchTokens = async (token: string | null): Promise<Token[]> => {
  if (!token) return [];
  return request<Token[]>("/tokens", {
    method: "GET",
    headers: { Authorization: token },
  });
};

export const createToken = async (
  root: string | null,
  description: string,
  namespace: string,
  read: boolean,
  write: boolean,
  shareRead: boolean,
  shareWrite: boolean,
  shareShare: boolean
): Promise<Token> => {
  if (!root) {
    throw new AppError("No root token provided. Please authenticate first.", {
      severity: ErrorSeverity.WARNING,
      context: { operation: "createToken" },
    });
  }

  const newToken: Token = {
    id: 0,
    code: "",
    description: description,
    namespace: namespace,
    creation_timestamp: new Date().toISOString().split("Z")[0],
    permission_read: read,
    permission_write: write,
    permission_share_read: shareRead,
    permission_share_write: shareWrite,
    permission_share_share: shareShare,
    parent: 0,
  };

  return request<Token>(
    "/tokens",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: root,
      },
      body: JSON.stringify(newToken),
    },
    root
  );
};

export const refreshCodes = async (
  root: string | null,
  tokenIds: number[]
): Promise<Token[]> => {
  if (!root) return [];
  const promises = tokenIds.map((id) =>
    request<Token>(`/tokens/${id}`, {
      method: "POST",
      headers: { Authorization: root },
    })
  );
  return Promise.all(promises);
};

export const deleteToken = (root: string | null, token_id: number) => {
  if (!root) {
    throw new AppError("No root token provided. Please authenticate first.", {
      severity: ErrorSeverity.WARNING,
      context: { operation: "deleteToken", tokenId: token_id },
    });
  }
  return request(`/tokens/${token_id}`, {
    method: "DELETE",
    headers: { Authorization: root },
  });
};

export const deleteTokens = (root: string | null, token_ids: number[]) => {
  if (!root) {
    throw new AppError("No root token provided. Please authenticate first.", {
      severity: ErrorSeverity.WARNING,
      context: { operation: "deleteTokens", tokenCount: token_ids.length },
    });
  }
  return request<number>("/tokens", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: root,
    },
    body: JSON.stringify(token_ids),
  });
};

export const exploreSpace = (
  path: string,
  pattern: string,
  token: Uint8Array | Array<number>
) => {
  if (token instanceof Array) {
    token = Uint8Array.from(token);
  }
  return request<ExploreDetail[]>(`/spaces/explore${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pattern,
      token: quoteFromBytes(token),
    }),
  });
};

export const exportSpace = async (
  path: string,
  exportInput: Mm2Input
): Promise<string> => {
  if (exportInput.pattern && typeof exportInput.pattern !== "string") {
    exportInput.pattern = exportInput.pattern[0];
  }

  if (exportInput.template && typeof exportInput.template !== "string") {
    exportInput.template = exportInput.template[0];
  }

  return request<string>(`/spaces/export${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportInput),
  });
};

export const clearSpace = (expression: string, path: string) => {
  return request<boolean>(`/spaces/clear${path}?expr=${expression}`, {
    method: "POST",
  });
};
