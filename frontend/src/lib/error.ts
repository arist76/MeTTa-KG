export enum ErrorSeverity {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
}

export interface ErrorDetails {
  originalTitle: string;
  originalMessage: string;
  statusCode?: number;
  context?: Record<string, unknown>;
  errorType: "AppError" | "Error" | "unknown";
}

export interface ToastDisplay {
  title: string;
  message: string;
  severity: ErrorSeverity;
}

export interface ErrorInfo {
  display: ToastDisplay;
  details: ErrorDetails;
}

export interface ErrorOptions {
  displayTitle?: string;
  displayMessage?: string;
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly severity: ErrorSeverity;
  public readonly statusCode?: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      severity?: ErrorSeverity;
      statusCode?: number;
      context?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.severity = options?.severity ?? ErrorSeverity.ERROR;
    this.statusCode = options?.statusCode;
    this.context = options?.context;
  }
}

const STATUS_TITLES: Record<number, string> = {
  400: "Invalid Request",
  401: "Authentication Required",
  403: "Access Denied",
  404: "Not Found",
  500: "Server Error",
  503: "Service Unavailable",
};

function getOriginalTitle(error: unknown, statusCode?: number): string {
  if (error instanceof AppError && statusCode) {
    return STATUS_TITLES[statusCode] ?? "Error";
  }

  return "Error";
}

function getDisplayTitle(error: unknown, options: ErrorOptions): string {
  if (options.displayTitle) return options.displayTitle;
  if (error instanceof AppError && error.statusCode) {
    return STATUS_TITLES[error.statusCode] ?? "Error";
  }
  return "Error";
}

function getDisplayMessage(error: unknown, options: ErrorOptions): string {
  if (options.displayMessage) return options.displayMessage;
  if (error instanceof Error) return error.message;
  return String(error) || "An unexpected error occurred";
}

export function extractErrorInfo(
  error: unknown,
  options: ErrorOptions = {}
): ErrorInfo {
  let originalMessage: string;
  let originalTitle: string;
  let severity: ErrorSeverity;
  let statusCode: number | undefined;
  let errorType: ErrorDetails["errorType"];
  let context: Record<string, unknown> | undefined;

  if (error instanceof AppError) {
    originalMessage = error.message;
    originalTitle = getOriginalTitle(error, error.statusCode);
    severity = error.severity;
    statusCode = error.statusCode;
    errorType = "AppError";
    context = { ...error.context, ...options.context };
  } else if (error instanceof Error) {
    originalMessage = error.message;
    originalTitle = "Error";
    severity = ErrorSeverity.ERROR;
    errorType = "Error";
    context = options.context;
  } else {
    originalMessage = String(error) || "An unexpected error occurred";
    originalTitle = "Error";
    severity = ErrorSeverity.ERROR;
    errorType = "unknown";
    context = options.context;
  }

  return {
    display: {
      title: getDisplayTitle(error, options),
      message: getDisplayMessage(error, options),
      severity,
    },
    details: {
      originalTitle,
      originalMessage,
      statusCode,
      context,
      errorType,
    },
  };
}

export type ToastVariant = "default" | "warning" | "destructive";

export function severityToVariant(severity: ErrorSeverity): ToastVariant {
  switch (severity) {
    case "error":
      return "destructive";
    case "warning":
      return "warning";
    default:
      return "default";
  }
}

export function toToastOptions(errorInfo: ErrorInfo, duration?: number) {
  return {
    title: errorInfo.display.title,
    description: errorInfo.display.message,
    variant: severityToVariant(errorInfo.display.severity),
    duration,
    details: errorInfo.details,
  };
}
