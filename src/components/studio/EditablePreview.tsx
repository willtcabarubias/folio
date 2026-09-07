"use client";

import { BarChart3, ChevronDown, ChevronUp, ClipboardCheck, Clock3, Columns2, Copy, Layers, Loader2, Plus, Quote, Table2, Trash2, Type, X } from "lucide-react";
import type { Block, DocumentSpec, Layout } from "@/lib/spec/types";

type Props = {
  spec: DocumentSpec;
  onChange: (next: DocumentSpec) => void;
  busy?: boolean;
  streaming?: boolean;
};

/** Layouts safe to switch between in the preview (structural cover/agenda/section/closing stay outline-owned). */
const SWITCHABLE_LAYOUTS: Layout[] = [
  "paragraph",
  "bullets",
  "groups",
  "timeline",
  "stats",
  "table",
  "comparison",
  "two-column",
  "quote",
  "quiz",
];

const isStructural = (l: Layout) => l === "cover" || l === "agenda" || l === "section" || l === "closing";

const LAYOUT_LABEL: Record<Layout, string> = {
  cover: "Cover",
  agenda: "Agenda",
  section: "Section",
  bullets: "Bullets",
  "two-column": "Two columns",
  stats: "Stats",
  quote: "Quote",
  timeline: "Timeline",
  comparison: "Comparison",
  table: "Table",
  paragraph: "Paragraph",
  groups: "Groups",
  closing: "Closing",
  quiz: "Quiz",
};

const LAYOUT_ICON: Record<Layout, React.ReactNode> = {
  cover: <Layers size={11} />,
  agenda: <Layers size={11} />,
  section: <Layers size={11} />,
  bullets: <Type size={11} />,
  "two-column": <Columns2 size={11} />,
  stats: <BarChart3 size={11} />,
  quote: <Quote size={11} />,
  timeline: <Clock3 size={11} />,
  comparison: <Columns2 size={11} />,
  table: <Table2 size={11} />,
  paragraph: <Type size={11} />,
  groups: <Layers size={11} />,
  closing: <Layers size={11} />,
  quiz: <ClipboardCheck size={11} />,
};

function fieldCls(disabled?: boolean) {
  return `field h-8 text-[13px] ${disabled ? "opacity-60" : ""}`;
}

export function EditablePreview({ spec, onChange, busy, streaming }: Props) {
  // Bulletproof: ignore malformed blocks from interrupted streams (never crash preview).
  const safeBlocks = (spec.blocks ?? []).filter((b) => b && typeof b.id === "string" && typeof b.title === "string");
  const sync = (nextBlocks: typeof safeBlocks) => onChange({ ...spec, blocks: nextBlocks });
  const updateBlock = (idx: number, patch: Partial<Block>) => {
    const next = safeBlocks.slice();
    if (!next[idx]) return;
    next[idx] = { ...next[idx], ...patch };
    sync(next);
  };
  const moveBlock = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= safeBlocks.length) return;
    const next = safeBlocks.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    sync(next);
  };
  const removeBlock = (idx: number) => {
    if (safeBlocks.length <= 1) return;
    sync(safeBlocks.filter((_, i) => i !== idx));
  };
  const duplicateBlock = (idx: number) => {
    const src = safeBlocks[idx];
    if (!src) return;
    const ids = new Set(safeBlocks.map((b) => b.id));
    let n = 0;
    let id = `${src.id}_copy`;
    while (ids.has(id)) id = `${src.id}_copy${++n}`;
    const next = safeBlocks.slice();
    next.splice(idx + 1, 0, { ...src, id, title: `${src.title} (copy)` });
    sync(next);
  };
  const removeBullet = (idx: number, bi: number) => {
    const b = safeBlocks[idx];
    if (!b) return;
    const bullets = Array.isArray(b.bullets) ? b.bullets : [];
    updateBlock(idx, { bullets: bullets.filter((_, k) => k !== bi) });
  };
  const addBullet = (idx: number, text: string) => {
    const v = text.trim();
    if (!v) return;
    const b = safeBlocks[idx];
    if (!b) return;
    const bullets = Array.isArray(b.bullets) ? b.bullets : [];
    updateBlock(idx, { bullets: [...bullets, v] });
  };
  const setHeader = (patch: Partial<{ group: string; members: string[]; subject: string; section: string }>) => {
    const nextMembers = patch.members ?? spec.header?.members ?? [];
    const nextGroup = (patch.group ?? spec.header?.group ?? "").trim();
    const nextSubject = (patch.subject ?? spec.header?.subject ?? "").trim();
    const nextSection = (patch.section ?? spec.header?.section ?? "").trim();
    const header =
      !nextGroup && !nextMembers.length && !nextSubject && !nextSection
        ? undefined
        : {
            ...(nextGroup ? { group: nextGroup.slice(0, 60) } : {}),
            ...(nextMembers.length ? { members: nextMembers.slice(0, 8) } : {}),
            ...(nextSubject ? { subject: nextSubject.slice(0, 60) } : {}),
            ...(nextSection ? { section: nextSection.slice(0, 60) } : {}),
          };
    onChange({ ...spec, header });
  };
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-[linear-gradient(180deg,#F2F5FC_0%,#EFF3FB_100%)] px-3 py-5 md:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {/* Cover-only header editor — prints on cover only, edits never regenerate. */}
        <div className="flex flex-col rounded-2xl bg-white p-4 ring-1 ring-line">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink md:text-[11px]">Cover header — cover only</p>
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-ink">Cover only</span>
          </div>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            <input
              value={spec.header?.group ?? ""}
              onChange={(e) => setHeader({ group: e.target.value })}
              disabled={busy}
              placeholder="Group 1"
              className="field h-8 text-[13px]"
              aria-label="Cover group"
            />
            <input
              value={spec.header?.subject ?? ""}
              onChange={(e) => setHeader({ subject: e.target.value })}
              disabled={busy}
              placeholder="Subject (e.g. Science)"
              className="field h-8 text-[13px]"
              aria-label="Cover subject"
            />
            <input
              value={spec.header?.section ?? ""}
              onChange={(e) => setHeader({ section: e.target.value })}
              disabled={busy}
              placeholder="Section (e.g. 7-Ruby)"
              className="field h-8 text-[13px]"
              aria-label="Cover section"
            />
            <input
              value={(spec.header?.members ?? []).join(" · ")}
              onChange={(e) => {
                const raw = e.target.value;
                const parts = raw.split(/[·\n;|]+/).map((s) => s.trim()).filter(Boolean);
                const out: string[] = [];
                for (const p of parts) {
                  if (p.includes(",") && (p.match(/,/g) ?? []).length >= 2 && !/^[A-Za-z'.\-]+\s*,\s*[A-Za-z'.\-]+\s*$/.test(p)) {
                    // "Bayang, Jhazel, Catani, Claire" → pair into "Bayang, Jhazel" + "Catani, Claire".
                    const toks = p.split(",").map((x) => x.trim()).filter(Boolean);
                    for (let i = 0; i + 1 < toks.length; i += 2) out.push(`${toks[i]}, ${toks[i + 1]}`);
                    if (toks.length % 2 === 1) out.push(toks[toks.length - 1]);
                  } else out.push(p);
                }
                setHeader({ members: out });
              }}
              disabled={busy}
              placeholder="Members — separated by · or new lines"
              className="field h-8 text-[13px]"
              aria-label="Cover members"
            />
          </div>
        </div>
        {safeBlocks.map((block, idx) => {
          const bullets = Array.isArray(block.bullets) ? block.bullets : [];
          const isLastStreaming = Boolean(streaming && idx === safeBlocks.length - 1);
          return (
          <div
            key={`${block.id}-${idx}`}
            className={`group relative flex flex-col rounded-2xl bg-white shadow-[0_8px_30px_-18px_rgba(20,40,90,0.25)] ring-1 ring-line ${busy && !streaming ? "opacity-60" : ""} ${streaming ? "animate-rise" : ""}`}
          >
            {/* block header — layout switch + move/duplicate/delete (structural cover/closing stay outline-owned) */}
            <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2">
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-ink">
                <span className="opacity-60">{LAYOUT_ICON[block.layout]}</span>
                {isStructural(block.layout) || busy ? (
                  LAYOUT_LABEL[block.layout]
                ) : (
                  <select
                    value={block.layout}
                    onChange={(e) => updateBlock(idx, { layout: e.target.value as Layout })}
                    disabled={busy}
                    className="cursor-pointer bg-transparent outline-none"
                    aria-label="Block layout"
                  >
                    {SWITCHABLE_LAYOUTS.map((l) => (
                      <option key={l} value={l}>
                        {LAYOUT_LABEL[l]}
                      </option>
                    ))}
                  </select>
                )}
              </span>
              <span className="text-xs font-semibold text-muted">{String(idx + 1).padStart(2, "0")}</span>
              {isLastStreaming && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-ink">
                  <Loader2 size={10} className="animate-spin" /> Writing…
                </span>
              )}
              <span className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" onClick={() => moveBlock(idx, -1)} disabled={busy || idx === 0} className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-20" aria-label="Move block up">
                  <ChevronUp size={13} />
                </button>
                <button type="button" onClick={() => moveBlock(idx, 1)} disabled={busy || idx === spec.blocks.length - 1} className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-20" aria-label="Move block down">
                  <ChevronDown size={13} />
                </button>
                <button type="button" onClick={() => duplicateBlock(idx)} disabled={busy} className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-20" aria-label="Duplicate block">
                  <Copy size={13} />
                </button>
                <button type="button" onClick={() => removeBlock(idx)} disabled={busy || spec.blocks.length <= 1} className="rounded-lg p-1 text-muted hover:bg-red-50 hover:text-danger disabled:opacity-20" aria-label="Delete block">
                  <Trash2 size={13} />
                </button>
              </span>
            </div>

            <div className="space-y-3 p-4">
              {/* title — always exists, editable */}
              <input
                value={block.title}
                onChange={(e) => updateBlock(idx, { title: e.target.value })}
                disabled={busy}
                placeholder="Block title"
                className="w-full border-0 bg-transparent p-0 text-[16px] font-semibold text-ink outline-none placeholder:text-muted/40 focus:ring-0"
              />
              {/* subtitle — only if already exists, no add */}
              {block.subtitle !== undefined && (
                <input
                  value={block.subtitle}
                  onChange={(e) => updateBlock(idx, { subtitle: e.target.value })}
                  disabled={busy}
                  placeholder="Subtitle"
                  className="w-full border-0 bg-transparent p-0 text-sm text-muted outline-none placeholder:text-muted/40"
                />
              )}

              {/* body — only if exists */}
              {block.body !== undefined && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted">Body</label>
                  <textarea
                    value={block.body}
                    onChange={(e) => updateBlock(idx, { body: e.target.value })}
                    disabled={busy}
                    placeholder="Paragraph text"
                    rows={block.body ? Math.min(6, Math.max(2, block.body.split("\n").length + 1)) : 2}
                    className="field min-h-[56px] resize-none py-2 text-[13px] leading-5"
                  />
                </div>
              )}

              {/* bullets — edit, add (Enter), remove */}
              {(bullets.length > 0 || !busy) && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted">Bullets · {bullets.length}</label>
                  <ul className="space-y-1">
                    {bullets.map((it, i) => (
                      <li key={i} className="group/bullet flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-line">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60" />
                        <input
                          value={it}
                          onChange={(e) => updateBlock(idx, { bullets: bullets.map((v, k) => (k === i ? e.target.value : v)) })}
                          disabled={busy}
                          className="flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeBullet(idx, i)}
                          disabled={busy}
                          className="mt-0.5 rounded-full p-1 text-muted/60 opacity-0 transition hover:bg-slate-200 hover:text-ink group-hover/bullet:opacity-100 disabled:opacity-20"
                          aria-label="Remove bullet"
                        >
                          <X size={12} />
                        </button>
                      </li>
                    ))}
                    {!busy && (
                      <li className="flex items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1">
                        <Plus size={12} className="shrink-0 text-muted/60" />
                        <input
                          placeholder="Add a bullet — Enter to add"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const el = e.target as HTMLInputElement;
                              addBullet(idx, el.value);
                              el.value = "";
                            }
                          }}
                          onBlur={(e) => {
                            if (e.target.value.trim()) {
                              addBullet(idx, e.target.value);
                              e.target.value = "";
                            }
                          }}
                          className="flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none placeholder:text-muted/50"
                        />
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* columns — only if exists */}
              {block.columns !== undefined && block.columns.length > 0 && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                  <label className="text-[11px] font-medium text-muted">Columns · {block.columns.length}</label>
                  <div className="grid gap-3 md:grid-cols-2">
                    {block.columns.map((col, i) => (
                      <div key={i} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-line">
                        {col.heading !== undefined && (
                          <input
                            value={col.heading}
                            onChange={(e) => {
                              const nextCols = block.columns!.map((c, k) => (k === i ? { ...c, heading: e.target.value } : c));
                              updateBlock(idx, { columns: nextCols });
                            }}
                            disabled={busy}
                            placeholder="Heading"
                            className={fieldCls(busy)}
                          />
                        )}
                        {col.body !== undefined && (
                          <textarea
                            value={col.body}
                            onChange={(e) => {
                              const nextCols = block.columns!.map((c, k) => (k === i ? { ...c, body: e.target.value } : c));
                              updateBlock(idx, { columns: nextCols });
                            }}
                            disabled={busy}
                            placeholder="Body"
                            rows={2}
                            className="field min-h-[44px] py-2 text-[13px]"
                          />
                        )}
                        {col.bullets.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-muted">Bullets</label>
                            <ul className="space-y-1">
                              {col.bullets.map((b, bi) => (
                                <li key={bi} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-line">
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60" />
                                  <input
                                    value={b}
                                    onChange={(e) => {
                                      const nextCols = block.columns!.map((c, k) => (k === i ? { ...c, bullets: c.bullets.map((v, kk) => (kk === bi ? e.target.value : v)) } : c));
                                      updateBlock(idx, { columns: nextCols });
                                    }}
                                    disabled={busy}
                                    className="flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none"
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* groups — only if exists */}
              {block.groups !== undefined && block.groups.length > 0 && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                  <label className="text-[11px] font-medium text-muted">Groups · {block.groups.length}</label>
                  <div className="space-y-3">
                    {block.groups.map((g, i) => (
                      <div key={i} className="rounded-xl bg-white p-3 ring-1 ring-line space-y-2">
                        <input
                          value={g.heading}
                          onChange={(e) => {
                            const next = block.groups!.map((v, k) => (k === i ? { ...v, heading: e.target.value } : v));
                            updateBlock(idx, { groups: next });
                          }}
                          disabled={busy}
                          placeholder="Heading"
                          className={fieldCls(busy)}
                        />
                        {g.meta !== undefined && (
                          <input
                            value={g.meta}
                            onChange={(e) => {
                              const next = block.groups!.map((v, k) => (k === i ? { ...v, meta: e.target.value } : v));
                              updateBlock(idx, { groups: next });
                            }}
                            disabled={busy}
                            placeholder="Meta"
                            className={fieldCls(busy)}
                          />
                        )}
                        {g.body !== undefined && (
                          <textarea
                            value={g.body}
                            onChange={(e) => {
                              const next = block.groups!.map((v, k) => (k === i ? { ...v, body: e.target.value } : v));
                              updateBlock(idx, { groups: next });
                            }}
                            disabled={busy}
                            placeholder="Description"
                            rows={2}
                            className="field min-h-[44px] py-2 text-[13px]"
                          />
                        )}
                        {g.bullets.length > 0 && (
                          <ul className="space-y-1">
                            {g.bullets.map((b, bi) => (
                              <li key={bi} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-line">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60" />
                                <input
                                  value={b}
                                  onChange={(e) => {
                                    const next = block.groups!.map((v, k) => (k === i ? { ...v, bullets: v.bullets.map((vv, kk) => (kk === bi ? e.target.value : vv)) } : v));
                                    updateBlock(idx, { groups: next });
                                  }}
                                  disabled={busy}
                                  className="flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none"
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* stats — only if exists */}
              {block.stats !== undefined && block.stats.length > 0 && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                  <label className="text-[11px] font-medium text-muted">Stats · {block.stats.length}</label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {block.stats.map((s, i) => (
                      <div key={i} className="flex gap-2 rounded-xl bg-white p-3 ring-1 ring-line">
                        <div className="flex-1 space-y-1.5">
                          <input
                            value={s.value}
                            onChange={(e) => {
                              const next = block.stats!.map((v, k) => (k === i ? { ...v, value: e.target.value } : v));
                              updateBlock(idx, { stats: next });
                            }}
                            disabled={busy}
                            placeholder="Value"
                            className={fieldCls(busy)}
                          />
                          <input
                            value={s.label}
                            onChange={(e) => {
                              const next = block.stats!.map((v, k) => (k === i ? { ...v, label: e.target.value } : v));
                              updateBlock(idx, { stats: next });
                            }}
                            disabled={busy}
                            placeholder="Label"
                            className={fieldCls(busy)}
                          />
                          {s.description !== undefined && (
                            <input
                              value={s.description}
                              onChange={(e) => {
                                const next = block.stats!.map((v, k) => (k === i ? { ...v, description: e.target.value } : v));
                                updateBlock(idx, { stats: next });
                              }}
                              disabled={busy}
                              placeholder="Description"
                              className={fieldCls(busy)}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* steps — only if exists */}
              {block.steps !== undefined && block.steps.length > 0 && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                  <label className="text-[11px] font-medium text-muted">Steps · {block.steps.length}</label>
                  <div className="space-y-2">
                    {block.steps.map((s, i) => (
                      <div key={i} className="flex gap-2 rounded-xl bg-white p-3 ring-1 ring-line">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">{i + 1}</div>
                        <div className="flex-1 space-y-1.5">
                          <input
                            value={s.label}
                            onChange={(e) => {
                              const next = block.steps!.map((v, k) => (k === i ? { ...v, label: e.target.value } : v));
                              updateBlock(idx, { steps: next });
                            }}
                            disabled={busy}
                            placeholder="Step label"
                            className={fieldCls(busy)}
                          />
                          {s.description !== undefined && (
                            <input
                              value={s.description}
                              onChange={(e) => {
                                const next = block.steps!.map((v, k) => (k === i ? { ...v, description: e.target.value } : v));
                                updateBlock(idx, { steps: next });
                              }}
                              disabled={busy}
                              placeholder="Description"
                              className={fieldCls(busy)}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* table — only if exists, edit cells only */}
              {block.table !== undefined && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                  <label className="text-[11px] font-medium text-muted">Table · {block.table.rows.length} rows</label>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] border-separate border-spacing-0 overflow-hidden rounded-xl bg-white ring-1 ring-line">
                      <thead>
                        <tr className="bg-slate-50">
                          {block.table.headers.map((h, c) => (
                            <th key={c} className="border-b border-line p-1">
                              <input
                                value={h}
                                onChange={(e) => {
                                  const nextHeaders = block.table!.headers.map((v, k) => (k === c ? e.target.value : v));
                                  updateBlock(idx, { table: { headers: nextHeaders, rows: block.table!.rows } });
                                }}
                                disabled={busy}
                                className="field h-7 text-xs"
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.table.rows.map((row, r) => (
                          <tr key={r}>
                            {row.map((cell, c) => (
                              <td key={c} className="border-b border-line/60 p-1">
                                <input
                                  value={cell}
                                  onChange={(e) => {
                                    const nextRows = block.table!.rows.map((rr, ri) => (ri === r ? rr.map((v, ki) => (ki === c ? e.target.value : v)) : rr));
                                    updateBlock(idx, { table: { headers: block.table!.headers, rows: nextRows } });
                                  }}
                                  disabled={busy}
                                  className="field h-7 text-xs"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* quote — only if exists */}
              {block.quote !== undefined && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                  <label className="text-[11px] font-medium text-muted">Quote</label>
                  <textarea
                    value={block.quote.text}
                    onChange={(e) => updateBlock(idx, { quote: { text: e.target.value, attribution: block.quote?.attribution } })}
                    disabled={busy}
                    rows={2}
                    className="field min-h-[56px] py-2 text-[13px]"
                  />
                  {block.quote.attribution !== undefined && (
                    <input
                      value={block.quote.attribution}
                      onChange={(e) => updateBlock(idx, { quote: { text: block.quote!.text, attribution: e.target.value } })}
                      disabled={busy}
                      placeholder="Attribution"
                      className={fieldCls(busy)}
                    />
                  )}
                </div>
              )}

              {/* quiz — only if exists */}
              {block.quiz !== undefined && block.quiz.length > 0 && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-line">
                  <label className="text-[11px] font-medium text-muted">Quiz · {block.quiz.length} questions</label>
                  <div className="space-y-2">
                    {block.quiz.map((q, qi) => (
                      <div key={qi} className="rounded-xl bg-white p-3 ring-1 ring-line">
                        <input
                          value={q.question}
                          onChange={(e) => {
                            const next = block.quiz!.map((v, k) => (k === qi ? { ...v, question: e.target.value } : v));
                            updateBlock(idx, { quiz: next });
                          }}
                          disabled={busy}
                          placeholder="Question"
                          className={fieldCls(busy)}
                        />
                        <div className="mt-2 grid gap-1.5">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-line">
                              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${q.answerIndex === oi || q.answer === opt ? "bg-ink text-white" : "bg-white text-muted ring-1 ring-line"}`}>{String.fromCharCode(65 + oi)}</span>
                              <input
                                value={opt}
                                onChange={(e) => {
                                  const next = block.quiz!.map((v, k) => (k === qi ? { ...v, options: v.options.map((vv, kk) => (kk === oi ? e.target.value : vv)) } : v));
                                  updateBlock(idx, { quiz: next });
                                }}
                                disabled={busy}
                                className="flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none"
                              />
                            </div>
                          ))}
                        </div>
                        {q.explanation !== undefined && (
                          <input
                            value={q.explanation}
                            onChange={(e) => {
                              const next = block.quiz!.map((v, k) => (k === qi ? { ...v, explanation: e.target.value } : v));
                              updateBlock(idx, { quiz: next });
                            }}
                            disabled={busy}
                            placeholder="Explanation"
                            className="mt-2 field h-7 text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* callout — only if exists */}
              {block.callout !== undefined && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted">Callout</label>
                  <input
                    value={block.callout}
                    onChange={(e) => updateBlock(idx, { callout: e.target.value })}
                    disabled={busy}
                    className={fieldCls(busy)}
                  />
                </div>
              )}

              {/* speaker notes removed: decks export without a notes pane */}
            </div>
          </div>
          );
        })}
        {streaming && (
          <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-line">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" />
              Writing next section…
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-slate-100 shimmer" />
              <div className="h-3 w-full rounded bg-slate-50 shimmer" />
              <div className="h-3 w-5/6 rounded bg-slate-50 shimmer" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
