"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, Minus, Plus, Sparkles, Bot } from "lucide-react";
import type { Question } from "@/lib/spec/types";
import { sanitizeChatMessage } from "@/lib/spec/normalize";
import type { StoredMessage } from "@/lib/store/projects";
import { ThinkingState, StreamingText } from "@/components/ui/ai-agent-response";
import type { TraceNode } from "@/components/ui/ai-agent-response";

export type ThreadMessage = StoredMessage & { error?: boolean; answers?: Record<string, string> };

type Props = {
  messages: ThreadMessage[];
  busy: boolean;
  busyHint?: string;
  compact?: boolean;
  onAnswer: (message: ThreadMessage, answers: { question: string; answer: string }[]) => void;
  onSkip: (message: ThreadMessage) => void;
  onRetry?: () => void;
};

const HINTS = ["Analyzing", "Synthesizing", "Composing", "Refining"];

export function ChatThread({ messages, busy, busyHint, compact, onAnswer, onSkip, onRetry }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [hintIdx, setHintIdx] = useState(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!busy) return;
    setHintIdx(0);
    const t = setInterval(() => setHintIdx((i) => (i + 1) % HINTS.length), 2200);
    return () => clearInterval(t);
  }, [busy]);

  const isAnswerMessage = (t: string) => t.startsWith("My answers:") || t.startsWith("Use the recommended");

  const workingLabel = busyHint ?? HINTS[hintIdx];

  const busyNodes = useMemo<TraceNode[]>(
    () => [
      {
        type: "reasoning",
        sentences: [
          "Analyzing your request with precision.",
          "Synthesizing context and shaping the structure.",
          "Composing the optimal response.",
          "Refining details for a premium outcome.",
        ],
        durationSeconds: 3.6,
      },
      {
        type: "step",
        primary: workingLabel,
        secondary: "Crafting your document",
      },
    ],
    [workingLabel]
  );

  // Determine the last assistant message id for streaming (only that one streams)
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && !m.error) return m.id;
    }
    return null;
  }, [messages]);

  return (
    <div className={`flex flex-col ${compact ? "gap-4" : "gap-6"}`}>
      {messages.map((m) => {
        if (m.role === "user" && isAnswerMessage(m.text)) return null;
        const isLatestAssistant = m.role === "assistant" && m.id === lastAssistantId;
        return (
          <div key={m.id} className="animate-rise">
            {m.role === "user" ? (
              <UserBubble text={m.text} attachedNames={m.attachedNames} compact={compact} />
            ) : (
              <AssistantMessage
                message={m}
                compact={compact}
                isLatest={isLatestAssistant && !busy}
                onAnswer={onAnswer}
                onSkip={onSkip}
                onRetry={onRetry}
              />
            )}
          </div>
        );
      })}
      {busy && (
        <div className="flex w-full items-start justify-start gap-3 animate-rise text-left">
          <Avatar />
          <div className="flex-1 min-w-0 pt-0.5 text-left">
            <ThinkingState nodes={busyNodes} workingLabel={workingLabel} autoPlay />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function Avatar() {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-sm ring-1 ring-white/60">
      <Bot size={14} strokeWidth={1.9} aria-hidden="true" />
    </div>
  );
}

function UserBubble({ text, attachedNames, compact }: { text: string; attachedNames?: string[]; compact?: boolean }) {
  return (
    <div className="flex w-full justify-end">
      <div className={`max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-left text-white shadow-sm ${compact ? "text-[11px] leading-4" : "text-[15px] leading-6"}`}>
        <div className="whitespace-pre-wrap">{text}</div>
        {attachedNames && attachedNames.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {attachedNames.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium leading-none text-ink shadow-sm">
                <FileText size={8} className="shrink-0 text-brand" />
                <span className="max-w-[100px] truncate">{n}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  compact,
  isLatest,
  onAnswer,
  onSkip,
  onRetry,
}: {
  message: ThreadMessage;
  compact?: boolean;
  isLatest?: boolean;
  onAnswer: Props["onAnswer"];
  onSkip: Props["onSkip"];
  onRetry?: () => void;
}) {
  const r = message.response;
  // Render-time net: messages stored before server-side sanitization may still
  // contain tofu/emoji bytes. sanitizeChatMessage is idempotent and cheap.
  const cleanText = sanitizeChatMessage(message.text);
  return (
    <div className="flex w-full items-start justify-start gap-3 text-left">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3 text-left">
        {message.error ? (
          <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-danger ring-1 ring-red-100">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p>{message.text}</p>
              {onRetry && (
                <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold underline underline-offset-2">
                  Try again
                </button>
              )}
            </div>
          </div>
        ) : isLatest ? (
          <StreamingText
            text={cleanText}
            speed={18}
            chunkSize={2}
            className={`text-left ${compact ? "text-[11px] leading-4" : "text-[15px] leading-6"}`}
          />
        ) : (
          <p className={`whitespace-pre-wrap text-left text-ink select-text text-pretty ${compact ? "text-[11px] leading-4" : "text-[15px] leading-6"}`}>{cleanText}</p>
        )}
        {r?.kind === "clarify" && (message.answered ? <AnsweredSummary questions={r.questions} answers={message.answers} /> : <ClarifyCard questions={r.questions} compact={compact} onSubmit={(a) => onAnswer(message, a)} />)}
      </div>
    </div>
  );
}

function AnsweredSummary({ questions, answers }: { questions: Question[]; answers?: Record<string, string> }) {
  if (!answers) return null;
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  return (
    <div className="overscroll-auto overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line">
      <div className="bg-ink px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white">My answers</p>
      </div>
      <div className="space-y-1.5 p-2.5">
        {questions.map((q) => {
          const text = answers[q.id];
          if (!text) return null;
          const isLong = text.length > 80 || text.includes(",");
          const open = Boolean(openMap[q.id]);
          return (
            <div key={q.id} className="flex max-w-full items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-left ring-1 ring-line">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success text-white shadow-sm">
                <Check size={9} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">{q.question}</p>
                <p
                  className="break-words whitespace-normal text-[10.5px] font-medium leading-4 text-ink"
                  style={!open && isLong ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}
                >
                  {text}
                </p>
                {isLong && (
                  <button type="button" onClick={() => setOpenMap((p) => ({ ...p, [q.id]: !p[q.id] }))} className="inline-flex items-center gap-1 text-[10px] font-medium text-brand">
                    {open ? "Show less" : "Show more"}
                    <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClarifyCard({ questions, compact, onSubmit }: { questions: Question[]; compact?: boolean; onSubmit: (answers: { question: string; answer: string }[]) => void }) {
  const total = questions.length;
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const q of questions) init[q.id] = q.recommended ? [q.recommended] : [];
    return init;
  });
  const [custom, setCustom] = useState<Record<string, string>>({});
  // Raw keystrokes for the stepper field (free text allowed — "12", "two pages", ...).
  const [numDraft, setNumDraft] = useState<Record<string, string | undefined>>({});

  const q = questions[idx];
  const rawUi: NonNullable<Question["ui"]> = q.ui ?? (q.options.length === 0 ? "text" : q.allowMultiple ? "checkbox" : "hybrid");
  // Mirror of the server coercion: only the format question may be pure radio.
  // Stale cached payloads with radio focus questions render hybrid instead.
  const ui = rawUi === "radio" && q.id !== "format" ? "hybrid" : rawUi;
  const isMulti = ui === "checkbox" || q.allowMultiple;
  const showOptions = ui !== "text";
  const showOtherField = ui === "hybrid" || ui === "text";
  const otherPlaceholder = q.placeholder || (ui === "text" ? "Type your answer" : "Type your own");
  // Numeric hybrid (length tiers like "Standard (10-12 slides)") gets a stepper
  // bound to the custom value instead of a bare text field.
  const isNumericHybrid = ui === "hybrid" && q.options.length > 0 && q.options.every((o) => /\d/.test(o));
  const stepperUnit = useMemo(() => {
    if (!isNumericHybrid) return "";
    const text = `${q.question} ${q.options.join(" ")}`.toLowerCase();
    if (/slide/.test(text)) return "slides";
    if (/page/.test(text)) return "pages";
    return "";
  }, [isNumericHybrid, q.question, q.options]);
  const stepperMax = q.id === "length" ? 30 : 99;

  const hasCurrent = useMemo(() => {
    if (ui === "text") return Boolean(custom[q.id]?.trim());
    return (selected[q.id]?.length ?? 0) > 0 || Boolean(custom[q.id]?.trim());
  }, [ui, q.id, selected, custom]);

  const stepperValue = useMemo(() => {
    if (!isNumericHybrid) return 0;
    const sources = [custom[q.id] ?? "", ...(selected[q.id] ?? []), q.recommended ?? "", q.options[0] ?? ""];
    for (const s of sources) {
      const m = s.match(/\d+/);
      if (m) return Math.max(1, Math.min(stepperMax, parseInt(m[0], 10)));
    }
    return 1;
  }, [isNumericHybrid, custom, selected, q.id, q.recommended, q.options, stepperMax]);

  const setStepper = (n: number) => {
    const v = Math.max(1, Math.min(stepperMax, n));
    const text = stepperUnit ? `${v} ${stepperUnit}` : `${v}`;
    setCustom((p) => ({ ...p, [q.id]: text }));
    setNumDraft((p) => ({ ...p, [q.id]: undefined }));
    // Single-source: a custom value replaces any picked preset.
    setSelected((p) => ({ ...p, [q.id]: [] }));
  };

  // Bare numbers on numeric hybrids get the hidden unit appended at submit
  // ("12" → "12 slides"); real text ("two pages") passes through untouched.
  const numericUnitFor = (qq: Question): string => {
    if (qq.options.length === 0 || !qq.options.every((o) => /\d/.test(o))) return "";
    const text = `${qq.question} ${qq.options.join(" ")}`.toLowerCase();
    if (/slide/.test(text)) return "slides";
    if (/page/.test(text)) return "pages";
    return "";
  };
  const withUnit = (qq: Question, raw: string): string => {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return t;
    const u = numericUnitFor(qq);
    return u ? `${t} ${u}` : t;
  };

  const buildAnswers = (override?: { id: string; selected: string[]; custom: string }) => {
    return questions.map((qq) => {
      let sel = selected[qq.id] ?? [];
      let c = custom[qq.id]?.trim() ?? "";
      if (override && override.id === qq.id) {
        sel = override.selected;
        c = override.custom.trim();
      }
      const multi = qq.allowMultiple;
      const answer = multi
        ? [...sel.map((s) => withUnit(qq, s)), ...(c ? [withUnit(qq, c)] : [])].join(", ")
        : withUnit(qq, c || sel[0] || "");
      const fallback = qq.recommended || qq.options[0] || "No preference";
      return { question: qq.question, answer: answer || fallback };
    });
  };

  const goNext = () => {
    if (idx < total - 1) setIdx((i) => i + 1);
    else onSubmit(buildAnswers());
  };

  const handleDecideForMe = () => {
    const rec = q.recommended || q.options[0] || "";
    if (ui === "text") {
      if (rec) setCustom((p) => ({ ...p, [q.id]: rec }));
    } else {
      setSelected((p) => ({ ...p, [q.id]: rec ? [rec] : [] }));
      if (showOtherField) setCustom((p) => ({ ...p, [q.id]: "" }));
    }
    if (idx < total - 1) {
      setTimeout(() => setIdx((i) => i + 1), 180);
    } else {
      const answers = buildAnswers({ id: q.id, selected: rec ? [rec] : [], custom: ui === "text" ? rec : "" });
      onSubmit(answers);
    }
  };

  const toggle = (opt: string) => {
    const cur = selected[q.id] ?? [];
    let next: string[];
    if (isMulti) next = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt];
    else next = [opt];
    setSelected((p) => ({ ...p, [q.id]: next }));
    // Single-source: picking a preset clears any typed custom value (and vice versa).
    if (!isMulti) setCustom((p) => ({ ...p, [q.id]: "" }));
  };

  const onCustomType = (value: string) => {
    setCustom((p) => ({ ...p, [q.id]: value }));
    // Single-source: typing clears picked presets so answers never merge ("1 page, 12").
    if (!isMulti && value.trim()) setSelected((p) => ({ ...p, [q.id]: [] }));
  };

  const progress = ((idx + 1) / total) * 100;

  return (
    <div className={`card-solid ${compact ? "p-3.5" : "p-5"} space-y-4`}>
      {/* progress + header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">Question {idx + 1} of {total}</span>
          <span className="text-xs text-muted">{idx + 1}/{total}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-baseline gap-2 pt-1">
          <span className="text-[11px] font-semibold text-brand">{String(idx + 1).padStart(2, "0")}</span>
          <p className={`font-medium text-ink ${compact ? "text-[14px] leading-5" : "text-[15px] leading-6"}`}>{q.question}</p>
        </div>
      </div>

      {/* options */}
      {showOptions && q.options.length > 0 && (
        <div className="flex flex-col gap-2">
          {q.options.map((opt) => {
            const active = selected[q.id]?.includes(opt);
            const rec = q.recommended === opt;
            const isCheck = ui === "checkbox" || q.allowMultiple;
            if (isCheck) {
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13.5px] font-medium transition ${active ? "bg-ink text-white shadow-sm" : "bg-slate-50 text-ink ring-1 ring-line hover:bg-white"}`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition ${active ? "border-white bg-white text-ink" : "border-slate-300 bg-white"}`}>{active && <Check size={12} strokeWidth={3} />}</span>
                  <span className="flex-1">{opt}</span>
                  {rec && <span className={`rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-brand ${active ? "bg-white/20 text-white" : ""}`}>recommended</span>}
                </button>
              );
            }
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13.5px] font-medium transition ${active ? "bg-ink text-white shadow-sm" : "bg-slate-50 text-ink ring-1 ring-line hover:bg-white"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${active ? "border-white bg-white" : "border-slate-300 bg-white"}`}>
                  {active && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                </span>
                <span className="flex-1">{opt}</span>
                {rec && <span className={`rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-brand ${active ? "bg-white/20 text-white" : ""}`}>recommended</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Type-your-own — always visible for hybrid/text; focused/typed state reads as selected */}
      {showOtherField && !isNumericHybrid && (
        <div>
          <input
            value={custom[q.id] ?? ""}
            onFocus={() => {
              // Focusing the field selects it: picked presets yield immediately.
              if (!isMulti) setSelected((p) => ({ ...p, [q.id]: [] }));
            }}
            onChange={(e) => onCustomType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasCurrent) {
                e.preventDefault();
                goNext();
              }
            }}
            placeholder={ui === "text" ? otherPlaceholder : "Type your own"}
            aria-label={ui === "text" ? "Your answer" : "Type your own"}
            className={`field min-h-[48px] rounded-xl text-[13.5px] transition focus:border-ink focus:ring-2 focus:ring-ink/70 ${
              custom[q.id]?.trim() ? "border-ink bg-white ring-2 ring-ink/70" : ""
            }`}
            autoFocus={ui === "text"}
          />
        </div>
      )}
      {showOtherField && isNumericHybrid && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-muted">Custom — type anything, or pick above</span>
          <div
            className={`flex min-h-[48px] w-full items-center gap-2 rounded-xl bg-slate-50 px-2 py-2 ring-1 ring-line transition focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/70 ${
              custom[q.id]?.trim() ? "border-ink bg-white ring-2 ring-ink/70" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => setStepper(stepperValue - 1)}
              disabled={stepperValue <= 1}
              aria-label="Decrease number"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-line transition hover:bg-ink hover:text-white active:scale-95 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-ink"
            >
              <Minus size={15} strokeWidth={2.5} />
            </button>
            <input
              value={numDraft[q.id] ?? stepperValue}
              onFocus={() => {
                if (!isMulti) setSelected((p) => ({ ...p, [q.id]: [] }));
              }}
              onChange={(e) => {
                const raw = e.target.value;
                setNumDraft((p) => ({ ...p, [q.id]: raw }));
                // Free text flows straight to the answer; presets yield.
                onCustomType(raw);
              }}
              onBlur={() => {
                // Numeric drafts snap back to the stepper; real text stays as typed.
                const d = numDraft[q.id];
                if (d !== undefined && /\d/.test(d)) setNumDraft((p) => ({ ...p, [q.id]: undefined }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hasCurrent) {
                  e.preventDefault();
                  goNext();
                }
              }}
              placeholder={otherPlaceholder}
              aria-label="Custom value — type any number or text"
              className="h-9 min-w-0 flex-1 border-0 bg-transparent p-0 text-center text-[16px] font-semibold tabular-nums text-ink outline-none placeholder:text-[13px] placeholder:font-normal placeholder:text-muted/60"
            />
            <button
              type="button"
              onClick={() => setStepper(stepperValue + 1)}
              disabled={stepperValue >= stepperMax}
              aria-label="Increase number"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-30"
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* footer */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-1">
          {idx > 0 && (
            <button
              type="button"
              onClick={() => setIdx((i) => i - 1)}
              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-muted ring-1 ring-line transition hover:bg-slate-100 hover:text-ink active:scale-95"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
              Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDecideForMe}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-br from-brand-soft to-white px-4 text-[13px] font-semibold text-brand ring-1 ring-brand/20 transition hover:from-brand-soft/80 hover:to-white hover:ring-brand/30 hover:shadow-sm"
          >
            <Sparkles size={14} className="text-brand" />
            Decide for me
          </button>
          <button type="button" onClick={goNext} disabled={!hasCurrent} className="btn-primary disabled:opacity-40">
            {idx === total - 1 ? "Continue" : "Next"}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
