"use client";

export type ErrorSeverity = "error" | "warn" | "info";

export type ErrorSource =
  | "api:render"
  | "api:agent"
  | "api:expand"
  | "api:extract"
  | "api:health"
  | "client:fetch"
  | "client:render"
  | "client:preview"
  | "client:export"
  | "window:onerror"
  | "window:unhandledrejection"
  | "react:error-boundary"
  | "unknown";

export type AppError = {
  id: string;
  time: number;
  source: ErrorSource;
  severity: ErrorSeverity;
  message: string;
  details?: string;
  status?: number;
  url?: string;
  method?: string;
  requestId?: string;
  stack?: string;
  cause?: string;
  hint?: string;
  meta?: Record<string, unknown>;
};
