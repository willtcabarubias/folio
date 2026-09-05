"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bug, ChevronDown, ChevronUp, Copy, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useErrorLog } from "@/lib/error/store";
import type { AppError } from "@/lib/error/types";

function timeLabel(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function sourceLabel(s: AppError["source"]) {
  const map: Record<string, string> = {
    "api:render": "Render",
    "api:expand": "Expand",
    "api:agent": "Agent",
    "api:extract": "Extract",
    "client:export": "Export",
    "client:preview": "Preview",
    "window:onerror": "Window",
    "window:unhandledrejection": "Promise",
  };
  return map[s] ?? s;
}

function statusTone(e: AppError) {
  if (e.status === 504 || e.status === 408) return "bg-amber-100 text-amber-800 ring-amber-200";
  if (e.status && e.status >= 500) return "bg-red-50 text-red-700 ring-red-200";
  if (e.status && e.status >= 400) return "bg-orange-50 text-orange-700 ring-orange-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function useIsMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function ErrorLogModal() {
  const { errors, isOpen, close, clear, remove } = useErrorLog();
  const mounted = useIsMounted();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // lock scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // esc to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const onCopy = useCallback(async (e: AppError) => {
    const payload = JSON.stringify(e, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedId(e.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopiedId(e.id);
      setTimeout(() => setCopiedId(null), 1600);
    }
  }, []);

  const onCopyAll = useCallback(async () => {
    const payload = JSON.stringify(errors, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedId("__all__");
      setTimeout(() => setCopiedId(null), 1600);
    } catch {}
  }, [errors]);

  const hasErrors = errors.length > 0;
  const title = useMemo(() => {
    if (!hasErrors) return "No errors";
    if (errors.length === 1) return "1 error";
    return `${errors.length} errors`;
  }, [errors.length, hasErrors]);

  if (!mounted || !isOpen) return null;

  const node = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Error log"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) close();
      }}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />

      {/* panel */}
      <div className="relative flex max-h-[86vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[20px] bg-white shadow-float ring-1 ring-line md:max-h-[78vh]">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-line/60 px-4 py-3.5 md:px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 ring-1 ring-red-200">
            <AlertTriangle size={18} className="text-red-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink md:text-[14px]">Error log</h2>
            <p className="text-xs leading-none text-muted md:text-[11px]">
              {title} · most recent first · session storage
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCopyAll}
              disabled={!hasErrors}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-slate-50 disabled:opacity-40 md:px-2.5 md:py-1 md:text-[11px]"
            >
              <Copy size={13} className="md:h-3 md:w-3" />
              {copiedId === "__all__" ? "Copied" : "Copy all"}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={!hasErrors}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-slate-50 disabled:opacity-40 md:px-2.5 md:py-1 md:text-[11px]"
            >
              <Trash2 size={13} className="md:h-3 md:w-3" />
              Clear
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close error log"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white hover:bg-black md:h-7 md:w-7"
            >
              <X size={16} className="md:h-3.5 md:w-3.5" />
            </button>
          </div>
        </div>

        {/* hint */}
        <div className="border-b border-amber-200/60 bg-amber-50 px-4 py-2.5 text-xs leading-5 text-amber-900 md:px-5 md:text-[11px]">
          <span className="font-semibold">Vercel Hobby tip:</span> free tier kills functions after 10s (504). Exports that hit this will appear as <code className="rounded bg-amber-100 px-1 py-0.5">504 / FUNCTION_TIMEOUT</code>. Shorten the doc or retry – detailed response below helps confirm.
        </div>

        {/* body */}
        <div className="scroll-thin flex-1 overflow-y-auto bg-[#fcfdfc] p-3 md:p-4">
          {!hasErrors ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-14 text-center ring-1 ring-line">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft ring-1 ring-line">
                <Bug size={18} className="text-ink" />
              </div>
              <p className="text-sm font-medium text-ink md:text-xs">No errors captured this session</p>
              <p className="max-w-sm text-xs leading-5 text-muted md:text-[11px]">
                Errors from <code className="rounded bg-slate-100 px-1">/api/*</code>, window crashes and unhandled rejections will appear here automatically.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {errors.map((e) => {
                const isExp = !!expanded[e.id];
                return (
                  <li
                    key={e.id}
                    className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_-18px_rgba(20,40,90,0.22)] ring-1 ring-line"
                  >
                    {/* row head */}
                    <div className="flex items-start gap-3 px-3.5 py-3 md:px-4">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 md:text-[10px] ${e.severity === "error" ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}
                      >
                        {e.severity.toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-[13px] font-semibold leading-5 text-ink md:text-[12px]">{e.message}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 md:text-[10px] ${statusTone(e)}`}>
                            {e.status ? `${e.status}` : "—"} {e.status === 504 ? "TIMEOUT" : e.status === 422 ? "UNPROCESSABLE" : ""}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink ring-1 ring-line md:text-[10px]">
                            {sourceLabel(e.source)}
                          </span>
                          <span className="text-[11px] text-muted md:text-[10px]">{timeLabel(e.time)}</span>
                          {e.url ? <span className="truncate text-[11px] text-muted md:text-[10px]">{e.method ?? "GET"} {e.url}</span> : null}
                        </div>
                        {e.hint ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ring-1 ring-amber-200 md:text-[11px]">{e.hint}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onCopy(e)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-muted ring-1 ring-line hover:bg-slate-50 hover:text-ink md:h-7 md:w-7"
                          aria-label="Copy error"
                        >
                          <Copy size={14} className="md:h-3 md:w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpanded((p) => ({ ...p, [e.id]: !p[e.id] }))}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white hover:bg-black md:h-7 md:w-7"
                          aria-label={isExp ? "Collapse" : "Expand"}
                        >
                          {isExp ? <ChevronUp size={14} className="md:h-3 md:w-3" /> : <ChevronDown size={14} className="md:h-3 md:w-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(e.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-muted ring-1 ring-line hover:bg-red-50 hover:text-red-600 md:h-7 md:w-7"
                          aria-label="Dismiss"
                        >
                          <X size={14} className="md:h-3 md:w-3" />
                        </button>
                      </div>
                    </div>

                    {isExp ? (
                      <div className="border-t border-line/60 bg-slate-50/70 px-3.5 py-3 md:px-4">
                        {e.details ? (
                          <div className="mb-3">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Details</p>
                            <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-5 text-ink ring-1 ring-line md:text-[11px]">
                              {e.details}
                            </pre>
                          </div>
                        ) : null}
                        {e.cause ? (
                          <div className="mb-3">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Cause</p>
                            <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-5 text-ink ring-1 ring-line md:text-[11px]">
                              {e.cause}
                            </pre>
                          </div>
                        ) : null}
                        {e.stack ? (
                          <div className="mb-3">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Stack</p>
                            <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-xs leading-5 text-ink ring-1 ring-line md:text-[11px]">
                              {e.stack}
                            </pre>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted md:text-[10px]">
                          <span className="rounded-full bg-white px-2 py-1 ring-1 ring-line">id: {e.id}</span>
                          {e.requestId ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-line">req: {e.requestId}</span> : null}
                          {e.meta ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-line">meta: {JSON.stringify(e.meta).slice(0, 200)}</span> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => onCopy(e)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-black md:px-2.5 md:py-1 md:text-[11px]"
                        >
                          <Copy size={13} className="md:h-3 md:w-3" />
                          {copiedId === e.id ? "Copied!" : "Copy JSON"}
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-line/60 bg-white px-4 py-3 text-xs text-muted md:px-5 md:text-[11px]">
          <span>
            Log kept in <code className="rounded bg-slate-100 px-1">sessionStorage</code> · cleared on tab close
          </span>
          <button type="button" onClick={close} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

export function ErrorLogBadge() {
  const { errors, hasUnread, open } = useErrorLog();
  if (errors.length === 0 && !hasUnread) return null;
  return (
    <button
      type="button"
      onClick={open}
      aria-label={hasUnread ? `Open error log, ${errors.length} errors, unread` : `Open error log, ${errors.length} errors`}
      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 transition md:h-7 md:w-7 ${hasUnread ? "bg-red-600 text-white ring-red-600 hover:bg-red-700" : "bg-white text-ink ring-line hover:bg-slate-50"}`}
    >
      <Bug size={14} className="md:h-3.5 md:w-3.5" />
      {errors.length > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
          {errors.length > 99 ? "99+" : errors.length}
        </span>
      ) : null}
      {hasUnread ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-white ring-2 ring-red-600" aria-hidden="true" /> : null}
    </button>
  );
}
