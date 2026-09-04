"use client";

import { BarChart3, Clock3, Columns2, Layers, Quote, Table2, Type, Loader2, ClipboardCheck } from "lucide-react";
import type { Block, DocumentSpec, Layout } from "@/lib/spec/types";

type Props = {
  spec: DocumentSpec;
  onChange: (next: DocumentSpec) => void;
  busy?: boolean;
  streaming?: boolean;
};

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
  const updateBlock = (idx: number, patch: Partial<Block>) => {
    const next = spec.blocks.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...spec, blocks: next });
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-[linear-gradient(180deg,#F2F5FC_0%,#EFF3FB_100%)] px-3 py-5 md:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {spec.blocks.map((block, idx) => {
          const isLastStreaming = Boolean(streaming && idx === spec.blocks.length - 1);
          return (
          <div
            key={block.id}
            className={`group relative flex flex-col rounded-2xl bg-white shadow-[0_8px_30px_-18px_rgba(20,40,90,0.25)] ring-1 ring-line ${busy && !streaming ? "opacity-60" : ""} ${streaming ? "animate-rise" : ""}`}
          >
            {/* block header — read-only, no drag, no layout switch, no move/duplicate/delete */}
            <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2">
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-ink">
                <span className="opacity-60">{LAYOUT_ICON[block.layout]}</span>
                {LAYOUT_LABEL[block.layout]}
              </span>
              <span className="text-xs font-semibold text-muted">{String(idx + 1).padStart(2, "0")}</span>
              {isLastStreaming && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-ink">
                  <Loader2 size={10} className="animate-spin" /> Writing…
                </span>
              )}
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

              {/* bullets — only if already has bullets, edit existing only, no add/remove */}
              {block.bullets.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted">Bullets · {block.bullets.length}</label>
                  <ul className="space-y-1">
                    {block.bullets.map((it, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-line">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60" />
                        <input
                          value={it}
                          onChange={(e) => updateBlock(idx, { bullets: block.bullets.map((v, k) => (k === i ? e.target.value : v)) })}
                          disabled={busy}
                          className="flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none"
                        />
                      </li>
                    ))}
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

              {/* notes — only if exists and pptx */}
              {spec.format === "pptx" && block.notes !== undefined && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted">Speaker notes</label>
                  <textarea
                    value={block.notes}
                    onChange={(e) => updateBlock(idx, { notes: e.target.value })}
                    disabled={busy}
                    rows={2}
                    className="field min-h-[44px] py-2 text-[13px]"
                  />
                </div>
              )}
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
