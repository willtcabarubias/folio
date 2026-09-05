"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AppError, ErrorSource, ErrorSeverity } from "./types";

type ErrorCtx = {
  errors: AppError[];
  hasUnread: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  clear: () => void;
  remove: (id: string) => void;
  push: (e: Omit<AppError, "id" | "time"> & { id?: string; time?: number }) => string;
  markRead: () => void;
};

const Ctx = createContext<ErrorCtx | null>(null);

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

const STORAGE_KEY = "folio.errorlog.v1";
const MAX_KEEP = 30;

function loadInitial(): AppError[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as AppError[];
    return Array.isArray(arr) ? arr.slice(0, MAX_KEEP) : [];
  } catch {
    return [];
  }
}

function persist(list: AppError[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_KEEP)));
  } catch {}
}

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<AppError[]>(() => loadInitial());
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const seenOpenRef = useRef(false);

  // hydrate from session on mount (client)
  useEffect(() => {
    setErrors(loadInitial());
  }, []);

  useEffect(() => {
    persist(errors);
  }, [errors]);

  const push = useCallback(
    (input: Omit<AppError, "id" | "time"> & { id?: string; time?: number }) => {
      const id = input.id ?? `err_${Date.now().toString(36)}_${uid()}`;
      const entry: AppError = {
        id,
        time: input.time ?? Date.now(),
        source: (input.source ?? "unknown") as ErrorSource,
        severity: (input.severity ?? "error") as ErrorSeverity,
        message: String(input.message ?? "Unknown error").slice(0, 800),
        details: input.details?.slice(0, 4000),
        status: input.status,
        url: input.url,
        method: input.method,
        requestId: input.requestId,
        stack: input.stack?.slice(0, 6000),
        cause: input.cause?.slice(0, 2000),
        hint: input.hint?.slice(0, 800),
        meta: input.meta,
      };
      setErrors((prev) => [entry, ...prev].slice(0, MAX_KEEP));
      // auto-open on new error severity error
      if (entry.severity === "error") {
        setIsOpen(true);
        setHasUnread(true);
      }
      // also log to console for Vercel log tail
      // eslint-disable-next-line no-console
      console.error(`[folio:error] ${entry.source} ${entry.status ?? ""} ${entry.message}`, entry);
      return id;
    },
    [],
  );

  const open = useCallback(() => {
    setIsOpen(true);
    setHasUnread(false);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setHasUnread(false);
    seenOpenRef.current = true;
  }, []);
  const clear = useCallback(() => {
    setErrors([]);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
    setHasUnread(false);
  }, []);
  const remove = useCallback((id: string) => {
    setErrors((p) => p.filter((e) => e.id !== id));
  }, []);
  const markRead = useCallback(() => setHasUnread(false), []);

  // Global window error capturing + custom folio:push-error from Api layer + global fetch interceptor
  useEffect(() => {
    const lastPushKey = new Map<string, number>();
    const dedup = (key: string) => {
      const now = Date.now();
      const prev = lastPushKey.get(key) ?? 0;
      if (now - prev < 1200) return true;
      lastPushKey.set(key, now);
      return false;
    };
    const onError = (ev: ErrorEvent) => {
      const key = `onerror:${ev.message}`;
      if (dedup(key)) return;
      push({
        source: "window:onerror",
        severity: "error",
        message: ev.message || "Window error",
        stack: ev.error?.stack ?? `${ev.filename}:${ev.lineno}:${ev.colno}`,
        details: ev.error?.message ? String(ev.error.message).slice(0, 2000) : undefined,
        meta: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno } as unknown as Record<string, unknown>,
        hint: "Check console for full stack. This often indicates an unhandled exception in a component.",
      });
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason: unknown = ev.reason;
      const msg = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : JSON.stringify(reason ?? "").slice(0, 800);
      const key = `rej:${msg}`;
      if (dedup(key)) return;
      const stack = reason instanceof Error ? reason.stack : undefined;
      push({
        source: "window:unhandledrejection",
        severity: "error",
        message: msg || "Unhandled promise rejection",
        stack,
        details: typeof reason === "object" && reason !== null ? JSON.stringify(reason, null, 2).slice(0, 3000) : undefined,
        hint: "A fetch/stream likely rejected without catch. Check /api logs in Vercel.",
      });
    };
    const onPushEvent = (ev: Event) => {
      const ce = ev as CustomEvent<Partial<AppError> & { message?: string }>;
      const d = ce.detail;
      if (!d || !d.message) return;
      const norm = `${d.status ?? 0}:${(d.url ?? "").slice(0, 80)}:${String(d.message).slice(0, 60)}`;
      const key = `push:${norm}`;
      if (dedup(key)) return;
      push({
        source: (d.source as ErrorSource) ?? "unknown",
        severity: (d.severity as ErrorSeverity) ?? "error",
        message: String(d.message).slice(0, 800),
        details: (d.details as string | undefined)?.slice(0, 4000),
        status: d.status as number | undefined,
        url: d.url as string | undefined,
        method: d.method as string | undefined,
        requestId: d.requestId as string | undefined,
        stack: (d.stack as string | undefined)?.slice(0, 6000),
        cause: (d.cause as string | undefined)?.slice(0, 2000),
        hint: (d.hint as string | undefined)?.slice(0, 800),
        meta: d.meta as Record<string, unknown> | undefined,
      });
    };
    // Patch fetch once to auto-log any /api non-ok response even if caller swallows
    const origFetch = window.fetch.bind(window);
    const patchedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const method = init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? (input as Request).method : "GET");
      let res: Response;
      try {
        res = await origFetch(input as RequestInfo, init as RequestInit);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (String(url).includes("/api/")) {
          const norm = `0:${String(url).slice(0, 80)}:${msg.slice(0, 60)}`;
          const key = `push:${norm}`;
          if (!dedup(key)) {
            push({
              source: url.includes("/api/render")
                ? "api:render"
                : url.includes("/api/expand")
                  ? "api:expand"
                  : url.includes("/api/agent")
                    ? "api:agent"
                    : url.includes("/api/extract")
                      ? "api:extract"
                      : "client:fetch",
              severity: "error",
              message: `Network error: ${msg}`,
              url: String(url).slice(0, 600),
              method,
              details: String(e).slice(0, 3000),
              hint: "Check your connection and Vercel function logs (timeout = 10s on Hobby).",
            });
          }
        }
        throw e;
      }
      if (!res.ok && String(url).includes("/api/")) {
        // Clone to read body without consuming for caller – best effort
        const status = res.status;
        let bodySnippet: string | undefined;
        try {
          const clone = res.clone();
          const ct = clone.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const j = (await clone.json().catch(() => null)) as { error?: string; details?: string; stack?: string } | null;
            if (j?.error) bodySnippet = j.error.slice(0, 1200) + (j.details ? `\n${j.details.slice(0, 1200)}` : "") + (j.stack ? `\n${j.stack.slice(0, 1200)}` : "");
          } else {
            bodySnippet = (await clone.text()).slice(0, 1800);
          }
        } catch {}
        const hint =
          status === 504
            ? "Vercel Hobby timeout (10s). Function killed – shorten doc or upgrade. See error details below."
            : status === 413
              ? "Payload too large."
              : status >= 500
                ? "Server error – check Vercel Function logs."
                : undefined;
        const message = bodySnippet ? `${method} ${url} → ${status}: ${bodySnippet.slice(0, 500)}` : `${method} ${url} → ${status} ${res.statusText}`;
        const norm = `${status}:${String(url).slice(0, 80)}:${message.slice(0, 60)}`;
        const key = `push:${norm}`;
        if (!dedup(key)) {
          push({
            source: url.includes("/api/render")
              ? "api:render"
              : url.includes("/api/expand")
                ? "api:expand"
                : url.includes("/api/agent")
                  ? "api:agent"
                  : url.includes("/api/extract")
                    ? "api:extract"
                    : "client:fetch",
            severity: "error",
            message: message.slice(0, 800),
            status,
            url: String(url).slice(0, 600),
            method,
            details: bodySnippet?.slice(0, 3500),
            hint,
            meta: { statusText: res.statusText } as unknown as Record<string, unknown>,
          });
        }
      }
      return res;
    };
    // install
    (window as unknown as { _folioOrigFetch?: typeof window.fetch })._folioOrigFetch = origFetch;
    window.fetch = patchedFetch;

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("folio:push-error", onPushEvent as EventListener);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("folio:push-error", onPushEvent as EventListener);
      // restore fetch
      try {
        const saved = (window as unknown as { _folioOrigFetch?: typeof window.fetch })._folioOrigFetch;
        if (saved) window.fetch = saved;
      } catch {}
    };
  }, [push]);

  const value = useMemo<ErrorCtx>(
    () => ({ errors, hasUnread, isOpen, open, close, clear, remove, push, markRead }),
    [errors, hasUnread, isOpen, open, close, clear, remove, push, markRead],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useErrorLog(): ErrorCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useErrorLog must be used within ErrorProvider");
  return ctx;
}

/** Imperative global push for non-React contexts (e.g. lib/client/api). */
let globalPush: ErrorCtx["push"] | null = null;

export function bindGlobalPush(fn: ErrorCtx["push"]) {
  globalPush = fn;
}

export function pushGlobalError(input: Omit<AppError, "id" | "time"> & { id?: string; time?: number }) {
  if (globalPush) {
    try {
      return globalPush(input);
    } catch {}
  }
  // fallback console
  // eslint-disable-next-line no-console
  console.error("[folio:error:global] ", input);
  return "";
}

/** Hook to bind provider push to global for imperative callers. */
export function useBindGlobalPush() {
  const { push } = useErrorLog();
  useEffect(() => {
    bindGlobalPush(push);
    return () => {
      globalPush = null;
    };
  }, [push]);
}

export function ErrorProviderBridge() {
  useBindGlobalPush();
  return null;
}
