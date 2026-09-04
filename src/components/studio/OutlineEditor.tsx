"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { LAYOUTS, type Layout, type Outline, type OutlineSection } from "@/lib/spec/types";

type Props = {
  outline: Outline;
  onChange: (next: Outline) => void;
  disabled?: boolean;
};

const LAYOUT_LABEL: Record<Layout, string> = {
  cover: "Cover",
  agenda: "Agenda",
  section: "Section divider",
  bullets: "Bullets",
  "two-column": "Two columns",
  stats: "Key numbers",
  quote: "Quote",
  timeline: "Timeline",
  comparison: "Comparison",
  table: "Table",
  paragraph: "Paragraphs",
  groups: "Entries",
  closing: "Closing",
  quiz: "Quiz",
};

export function OutlineEditor({ outline, onChange, disabled }: Props) {
  const isDeck = outline.format === "pptx";
  const update = (sections: OutlineSection[]) => onChange({ ...outline, sections, targetLength: isDeck ? sections.length : outline.targetLength });

  const updateSection = (idx: number, patch: Partial<OutlineSection>) => update(outline.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= outline.sections.length) return;
    const sections = [...outline.sections];
    [sections[idx], sections[j]] = [sections[j], sections[idx]];
    update(sections);
  };
  const remove = (idx: number) => {
    if (outline.sections.length <= 2) return;
    update(outline.sections.filter((_, i) => i !== idx));
  };
  const add = (afterIdx: number) => {
    const next: OutlineSection = { id: `s_${Date.now().toString(36)}`, title: "", layout: isDeck ? "bullets" : "paragraph", points: [] };
    const sections = [...outline.sections];
    sections.splice(afterIdx + 1, 0, next);
    update(sections);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-2.5">
      {outline.sections.map((s, i) => (
        <SectionCard
          key={s.id}
          index={i}
          section={s}
          total={outline.sections.length}
          isDeck={isDeck}
          disabled={disabled}
          onChange={(patch) => updateSection(i, patch)}
          onMove={(d) => move(i, d)}
          onRemove={() => remove(i)}
          onAddAfter={() => add(i)}
        />
      ))}
      <button
        type="button"
        onClick={() => add(outline.sections.length - 1)}
        disabled={disabled}
        className="group flex min-h-[96px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white/60 p-4 text-muted transition hover:border-brand/30 hover:bg-white hover:text-ink disabled:opacity-40"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 transition group-hover:bg-brand-soft">
          <Plus size={14} />
        </span>
        <span className="text-sm font-medium">Add {isDeck ? "slide" : "section"}</span>
        <span className="text-xs text-muted">or ask in chat</span>
      </button>
    </div>
  );
}

function SectionCard({
  index,
  section,
  total,
  isDeck,
  disabled,
  onChange,
  onMove,
  onRemove,
  onAddAfter,
}: {
  index: number;
  section: OutlineSection;
  total: number;
  isDeck: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<OutlineSection>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAddAfter: () => void;
}) {
  const [newPoint, setNewPoint] = useState("");
  const locked = section.layout === "cover";
  const layoutChoices = LAYOUTS.filter((l) => (isDeck ? true : l !== "agenda" && l !== "section"));

  const setPoint = (pi: number, value: string) => onChange({ points: section.points.map((p, i) => (i === pi ? value : p)) });
  const removePoint = (pi: number) => onChange({ points: section.points.filter((_, i) => i !== pi) });
  const addPoint = () => {
    const v = newPoint.trim();
    if (!v) return;
    onChange({ points: [...section.points, v] });
    setNewPoint("");
  };

  return (
    <div className="group card-solid p-4 transition hover:ring-brand/30">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-ink">{String(index + 1).padStart(2, "0")}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              value={section.title}
              onChange={(e) => onChange({ title: e.target.value })}
              disabled={disabled}
              placeholder={isDeck ? "Slide title" : "Section heading"}
              className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold text-ink outline-none placeholder:text-muted/60"
              aria-label={`Section ${index + 1} title`}
            />
            <select
              value={section.layout}
              onChange={(e) => onChange({ layout: e.target.value as Layout })}
              disabled={disabled || locked}
              className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-muted ring-1 ring-line outline-none focus:ring-brand/40 disabled:opacity-60"
              aria-label="Layout"
            >
              {layoutChoices.map((l) => (
                <option key={l} value={l}>
                  {LAYOUT_LABEL[l]}
                </option>
              ))}
            </select>
          </div>

          <ul className="mt-2 space-y-1">
            {section.points.map((p, pi) => (
              <li key={pi} className="flex items-start gap-2">
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60" />
                <input
                  value={p}
                  onChange={(e) => setPoint(pi, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && p === "") {
                      e.preventDefault();
                      removePoint(pi);
                    }
                  }}
                  disabled={disabled}
                  className="w-full border-0 bg-transparent p-0 text-[13.5px] leading-6 text-ink/90 outline-none"
                  aria-label={`Point ${pi + 1}`}
                />
                <button type="button" onClick={() => removePoint(pi)} disabled={disabled} className="mt-1 rounded-full p-1 text-muted/60 opacity-0 transition hover:bg-slate-100 hover:text-ink group-hover:opacity-100" aria-label="Remove point">
                  <X size={12} />
                </button>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <Plus size={12} className="shrink-0 text-muted/60" />
              <input
                value={newPoint}
                onChange={(e) => setNewPoint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPoint();
                  }
                }}
                onBlur={addPoint}
                disabled={disabled}
                placeholder={section.layout === "cover" ? (isDeck ? "Add a tagline" : "Add a header detail (email, date, recipient)") : "Add a point"}
                className="w-full border-0 bg-transparent p-0 text-[13.5px] leading-6 text-ink outline-none placeholder:text-muted/50"
              />
            </li>
          </ul>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" onClick={() => onMove(-1)} disabled={disabled || index <= 1} className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-20" aria-label="Move up">
            <ChevronUp size={14} />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={disabled || index === 0 || index === total - 1} className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-20" aria-label="Move down">
            <ChevronDown size={14} />
          </button>
          <button type="button" onClick={onAddAfter} disabled={disabled} className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-ink" aria-label="Add below">
            <Plus size={14} />
          </button>
          <button type="button" onClick={onRemove} disabled={disabled || locked || total <= 2} className="rounded-lg p-1 text-muted hover:bg-red-50 hover:text-danger disabled:opacity-20" aria-label="Remove">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
