"use client";

import { AlertCircle, Check, FileText, Loader2, Minus, Plus, Sparkles, X } from "lucide-react";
import type { Attachment, Format, Outline, PageSize } from "@/lib/spec/types";
import type { ReactNode } from "react";

export type GenState =
  | { status: "idle" }
  | { status: "writing" | "rendering" }
  | { status: "ready"; pages?: number; targetPages?: number; fitted?: boolean; trimmed?: number; warnings: string[] }
  | { status: "error"; message: string };

type Props = {
  outline: Outline;
  onChange: (next: Outline) => void;
  attachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  gen: GenState;
  stale: boolean;
  hasSpec: boolean;
  onGenerate: () => void;
  hideGenerate?: boolean;
};

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "pptx", label: "PPTX", hint: "16:9 slides" },
  { id: "docx", label: "DOCX", hint: "Editable Word file" },
  { id: "pdf", label: "PDF", hint: "Print-ready" },
];

export function SettingsPanel({ outline, onChange, attachments, onRemoveAttachment, gen, stale, hasSpec, onGenerate, hideGenerate }: Props) {
  const isDeck = outline.format === "pptx";
  const busy = gen.status === "writing" || gen.status === "rendering";
  const update = (patch: Partial<Outline>) => onChange({ ...outline, ...patch });

  const setFormat = (format: Format) => {
    if (format === outline.format) return;
    const nowDeck = format === "pptx";
    let sections = outline.sections;
    if (!nowDeck) sections = sections.filter((s) => s.layout !== "agenda" && s.layout !== "section");
    const targetLength = nowDeck ? sections.length : outline.format === "pptx" ? outline.suggestedLength || 3 : outline.targetLength;
    update({ format, sections, targetLength, lengthSource: nowDeck ? outline.lengthSource : outline.format === "pptx" ? "inferred" : outline.lengthSource });
  };
  const setLength = (n: number) => update({ targetLength: Math.min(30, Math.max(1, n)), lengthSource: "user" });
  const resetLength = () => update({ targetLength: outline.suggestedLength || 1, lengthSource: "inferred" });

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        <Group title="Output">
          <Row label="Format">
            <div className="flex rounded-full bg-slate-100 p-0.5" role="radiogroup" aria-label="Format">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={outline.format === f.id}
                  disabled={busy}
                  onClick={() => setFormat(f.id)}
                  title={f.hint}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${outline.format === f.id ? "bg-ink text-white shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Length" hint={isDeck ? "One slide per section" : outline.lengthSource === "inferred" ? "Standard for this document type" : "Set by you"}>
            {isDeck ? (
              <span className="inline-flex h-8 items-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-ink">
                {outline.sections.length} slide{outline.sections.length === 1 ? "" : "s"}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <div className="inline-flex h-8 items-center rounded-lg bg-slate-100">
                  <button type="button" disabled={busy || outline.targetLength <= 1} onClick={() => setLength(outline.targetLength - 1)} className="flex h-8 w-8 items-center justify-center text-muted hover:text-ink disabled:opacity-30" aria-label="Fewer pages">
                    <Minus size={14} />
                  </button>
                  <span className="w-16 text-center text-sm font-semibold text-ink">
                    {outline.targetLength} page{outline.targetLength === 1 ? "" : "s"}
                  </span>
                  <button type="button" disabled={busy || outline.targetLength >= 30} onClick={() => setLength(outline.targetLength + 1)} className="flex h-8 w-8 items-center justify-center text-muted hover:text-ink disabled:opacity-30" aria-label="More pages">
                    <Plus size={14} />
                  </button>
                </div>
                {outline.lengthSource === "user" ? (
                  <button type="button" onClick={resetLength} disabled={busy} className="text-xs font-medium text-brand hover:underline">
                    Auto
                  </button>
                ) : (
                  <span className="chip chip-brand">Auto</span>
                )}
              </div>
            )}
          </Row>
          {!isDeck && (
            <Row label="Page size">
              <div className="flex rounded-full bg-slate-100 p-0.5">
                {(["A4", "Letter"] as PageSize[]).map((p) => (
                  <button key={p} type="button" disabled={busy} onClick={() => update({ pageSize: p })} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${outline.pageSize === p ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </Row>
          )}
        </Group>

        <Group title="Details">
          <Field label="Title" value={outline.title} onChange={(v) => update({ title: v })} disabled={busy} />
          <Field label="Subtitle" value={outline.subtitle ?? ""} onChange={(v) => update({ subtitle: v || undefined })} disabled={busy} placeholder="Optional" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type" value={outline.docType} onChange={(v) => update({ docType: v })} disabled={busy} />
            <Field label="Language" value={outline.language} onChange={(v) => update({ language: v })} disabled={busy} />
            <Field label="Audience" value={outline.audience ?? ""} onChange={(v) => update({ audience: v || undefined })} disabled={busy} placeholder="Anyone" />
            <Field label="Tone" value={outline.tone ?? ""} onChange={(v) => update({ tone: v || undefined })} disabled={busy} placeholder="Professional" />
          </div>
        </Group>

        <Group title="Sources" aside={<span className="text-xs text-muted">{attachments.length ? `${attachments.filter((a) => a.status === "ready").length} file${attachments.length === 1 ? "" : "s"}` : "None"}</span>}>
          {attachments.length === 0 ? (
            <p className="text-xs leading-5 text-muted">Attach PDFs, Word files or notes in the chat to ground the content in your material.</p>
          ) : (
            <ul className="space-y-1.5">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-xs">
                  <FileText size={14} className={a.status === "error" ? "text-danger" : "text-brand"} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{a.name}</span>
                  <span className="text-muted">{a.status === "ready" ? `${(a.chars / 1000).toFixed(1)}k chars` : a.status}</span>
                  <button type="button" onClick={() => onRemoveAttachment(a.id)} className="rounded-full p-0.5 text-muted hover:bg-white hover:text-ink" aria-label={`Remove ${a.name}`}>
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Group>
      </div>

      {hideGenerate ? null : (
        <div className="border-t border-line/80 bg-white/70 p-4">
          {busy && (
            <div className="mb-3 space-y-1.5">
              <Step done={gen.status === "rendering"} active={gen.status === "writing"} label="Writing content from your outline" />
              <Step done={false} active={gen.status === "rendering"} label={isDeck ? "Designing slides" : `Laying out ${outline.targetLength} page${outline.targetLength === 1 ? "" : "s"}`} />
            </div>
          )}
          {gen.status === "ready" && !stale && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted">
              <Check size={14} className="mt-0.5 shrink-0 text-success" />
              <span>
                {isDeck ? `${outline.sections.length} slides ready.` : gen.pages ? `${gen.pages} page${gen.pages === 1 ? "" : "s"} — fits the ${gen.targetPages ?? outline.targetLength}-page target.` : "Document ready."}
                {gen.trimmed ? ` ${gen.trimmed} detail${gen.trimmed === 1 ? "" : "s"} trimmed to fit.` : ""}
                {gen.fitted === false ? " Could not fully fit — consider more pages." : ""}
                {gen.warnings.length ? " Some sections used the outline directly." : ""}
              </span>
            </div>
          )}
          {gen.status === "error" && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-danger">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{gen.message}</span>
            </div>
          )}
          {stale && hasSpec && !busy && <p className="mb-2 text-xs text-muted">Changes since the last generation — generate to update the preview.</p>}
          <button type="button" onClick={onGenerate} disabled={busy || !outline.title.trim()} className="btn-primary h-11 w-full text-[15px]">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={16} />}
            {busy ? (gen.status === "writing" ? "Writing" : "Rendering") : "Generate"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-3.5 ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</h3>
        {aside}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="pt-1.5">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint && <p className="text-[11px] text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} className="field h-9" />
    </label>
  );
}

function Step({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`flex h-4 w-4 items-center justify-center rounded-full ${done ? "bg-success text-white" : active ? "bg-brand-soft text-brand" : "bg-slate-100 text-muted"}`}>
        {done ? <Check size={10} /> : active ? <Loader2 size={10} className="animate-spin" /> : <span className="h-1 w-1 rounded-full bg-current" />}
      </span>
      <span className={done ? "text-muted line-through" : active ? "text-ink" : "text-muted"}>{label}</span>
    </div>
  );
}
