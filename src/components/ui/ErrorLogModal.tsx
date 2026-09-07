"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Copy, LifeBuoy, RotateCcw, CircleCheck, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useErrorLog } from "@/lib/error/store";
import type { AppError } from "@/lib/error/types";

function friendlySummary(e?: AppError): string {
  if (!e) return "Something didn't work as expected.";
  if (e.status === 504 || e.status === 408)
    return "This took a little too long and timed out. Please try again — a shorter document usually works better.";
  if (e.status === 413) return "This looks a bit too large to process right now. Please try a smaller file.";
  if (e.status && e.status >= 500) return "Our service had a brief hiccup. Please try again in a moment.";
  if (e.status && e.status >= 400) return "We couldn't complete that request. Please check your input and try again.";
  const msg = e.message.toLowerCase();
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed") || msg.includes("load"))
    return "We're having trouble reaching the service. Please check your connection and try again.";
  return "Something didn't work as expected. Please try again.";
}

function buildSupportReport(errors: AppError[]): string {
  const lines = [
    "Folio — support details",
    `Date: ${new Date().toLocaleString()}`,
    `Issues noticed: ${errors.length}`,
    "",
    "What you can tell the developer:",
    `"I saw a 'Something didn't go as planned' message. I've pasted the details below."`,
    "",
    "--- Details for the developer ---",
    JSON.stringify(errors, null, 2),
  ];
  return lines.join("\n");
}

function useIsMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ErrorLogModal() {
  const { errors, isOpen, close, clear } = useErrorLog();
  const mounted = useIsMounted();
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset local UI each time the dialog opens — intentional reset when dialog session starts
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowDetails(false);
      setCopied(false);
    }
  }, [isOpen]);

  // Lock scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const latest = errors[0];
  const summary = useMemo(() => friendlySummary(latest), [latest]);

  const onCopyAll = useCallback(async () => {
    const payload = buildSupportReport(errors);
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [errors]);

  const onRetry = useCallback(() => {
    close();
    // Small delay so the dialog closes cleanly before reload
    setTimeout(() => window.location.reload(), 80);
  }, [close]);

  if (!mounted || !isOpen) return null;

  const hasErrors = errors.length > 0;

  const node = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Something went wrong">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={close} aria-hidden="true" />

      <div className="relative flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-[22px] bg-white shadow-float ring-1 ring-line/40 animate-rise md:rounded-[19px]">
        {/* header — calm, matches app dialogs */}
        <div className="flex items-center justify-between px-6 py-4 md:px-5 md:py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-ink md:h-8 md:w-8">
              <LifeBuoy size={16} className="md:h-3.5 md:w-3.5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink md:text-[13px]">Something didn&apos;t go as planned</h2>
              <p className="mt-0.5 text-xs text-muted md:text-[11px]">Don&apos;t worry — your work is safe.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Dismiss"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-shell text-muted transition hover:bg-line hover:text-ink md:h-7 md:w-7"
          >
            <X size={16} className="md:h-3.5 md:w-3.5" />
          </button>
        </div>

        {/* body */}
        <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-4 md:px-5">
          {!hasErrors ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-ink md:h-9 md:w-9">
                <CircleCheck size={18} aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-medium text-ink md:text-xs">All good — no issues found</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted md:text-[11px]">
                If something isn&apos;t working, try again. You can safely close this message.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 md:gap-2.5">
              {/* friendly explanation */}
              <div className="rounded-2xl bg-shell/60 p-4 ring-1 ring-line/50 md:p-3.5">
                <p className="text-sm leading-relaxed text-ink md:text-[13px]">{summary}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted md:text-[11px]">
                  If you keep seeing this, please contact the developer and include the details below — it helps us fix
                  things faster.
                  {errors.length > 1 ? ` We noticed ${errors.length} hiccups, showing the most recent one.` : ""}
                </p>
              </div>

              {/* steps */}
              <ol className="flex flex-col gap-2">
                {[
                  { n: "1", title: "Try again", sub: "This resolves most temporary issues." },
                  { n: "2", title: "Copy details for the developer", sub: "One tap copies everything support needs." },
                  { n: "3", title: "Send it to support", sub: "Paste the copied details in your message." },
                ].map((s) => (
                  <li key={s.n} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-line/50">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white md:h-6 md:w-6 md:text-[11px]">
                      {s.n}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-ink md:text-[11px]">{s.title}</span>
                      <span className="block text-xs text-muted md:text-[11px]">{s.sub}</span>
                    </span>
                  </li>
                ))}
              </ol>

              {/* developer details — collapsed by default, de-emphasised */}
              <div className="overflow-hidden rounded-xl bg-white ring-1 ring-line/50">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-shell/50"
                >
                  <span className="text-xs font-medium text-muted md:text-[11px]">Details for the developer</span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full bg-shell text-muted transition-transform ${showDetails ? "rotate-180" : ""}`}
                  >
                    <ChevronDown size={14} className="md:h-3 md:w-3" />
                  </span>
                </button>
                {showDetails ? (
                  <div className="border-t border-line/50 bg-shell/40 p-3">
                    <pre className="scroll-thin max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-[11px] leading-5 text-muted ring-1 ring-line/50 md:text-[10px]">
                      {JSON.stringify(
                        errors.map((e) => ({
                          time: new Date(e.time).toLocaleString(),
                          message: e.message,
                          status: e.status,
                          url: e.url,
                          details: e.details,
                        })),
                        null,
                        2,
                      )}
                    </pre>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[11px] text-muted/70 md:text-[10px]">Only needed if you contact support.</p>
                      <button
                        type="button"
                        onClick={clear}
                        className="text-[11px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline md:text-[10px]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* footer — matches app dialog pattern */}
        <div className="flex flex-col gap-2 border-t border-line/60 bg-shell/50 px-6 py-3 md:px-5 md:py-2.5">
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={close} className="btn-ghost h-9 md:h-8">
              Dismiss
            </button>
            {hasErrors ? (
              <button type="button" onClick={onCopyAll} className="btn-secondary h-9 md:h-8">
                {copied ? <Check size={14} className="md:h-3 md:w-3" /> : <Copy size={14} className="md:h-3 md:w-3" />}
                {copied ? "Copied" : "Copy details"}
              </button>
            ) : null}
            <button type="button" onClick={onRetry} className="btn-primary h-9 md:h-8">
              <RotateCcw size={14} className="md:h-3 md:w-3" />
              Try again
            </button>
          </div>
          {copied ? (
            <p className="text-right text-[11px] text-muted md:text-[10px]">
              Copied — paste it in your message to the developer.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
