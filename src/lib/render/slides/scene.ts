import { getTheme, type Theme } from "@/lib/spec/themes";
import type { Block, DocumentSpec } from "@/lib/spec/types";

/* ------------------------------------------------------------------ */
/*  Geometry (inches, 16:9)                                             */
/* ------------------------------------------------------------------ */

export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;
const MX = 0.75;
const CW = SLIDE_W - MX * 2;
const TITLE_Y = 0.55;
const BODY_Y = 1.7;
const BODY_H = 4.95;

/* ------------------------------------------------------------------ */
/*  Primitives                                                          */
/* ------------------------------------------------------------------ */

export type FontRole = "heading" | "body" | "serif";
export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export type TextPrim = {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  paragraphs: string[];
  bullets: boolean;
  font: FontRole;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  opacity: number;
  align: Align;
  valign: VAlign;
  charSpacing?: number;
  lineSpacing: number;
  /** Space after each paragraph, in em. */
  paraGap: number;
};
export type RectPrim = { kind: "rect"; x: number; y: number; w: number; h: number; color: string; radius: number; opacity: number; stroke?: { color: string; width: number } };
export type CirclePrim = { kind: "circle"; x: number; y: number; d: number; color: string; opacity: number };
export type TablePrim = {
  kind: "table";
  x: number;
  y: number;
  w: number;
  colW: number[];
  headers: string[];
  rows: string[][];
  size: number;
  font: FontRole;
  headerFill: string;
  headerColor: string;
  headerRule: string;
  textColor: string;
  rowRule: string;
  fill: string;
};
export type Prim = TextPrim | RectPrim | CirclePrim | TablePrim;
export type SlideScene = { bg: string; items: Prim[]; notes?: string };
export type DeckScene = { slides: SlideScene[]; fonts: { heading: string; body: string } };

type Box = { x: number; y: number; w: number; h: number };
type TextOpts = Partial<Omit<TextPrim, "kind" | "x" | "y" | "w" | "h" | "paragraphs" | "size" | "color">> & { size: number; color: string };

type Palette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
  onPrimary: string;
  line: string;
  strong: string;
  strokeCards: boolean;
  dark: boolean;
};

function palette(t: Theme): Palette {
  const c = t.colors;
  return { ...c, strong: t.dark ? c.accent : c.primary, strokeCards: c.surface.toUpperCase() === "FFFFFF", dark: t.dark };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

export function fitFont(lines: string[], wIn: number, hIn: number, start: number, min: number, lineSpacing = 1.25, paraGapEm = 0.45): number {
  for (let fs = start; fs >= min; fs -= 1) {
    const cpl = Math.max(8, Math.floor((wIn * 72) / (fs * 0.52)));
    let total = 0;
    for (const l of lines) total += Math.max(1, Math.ceil(l.length / cpl));
    const need = (total * fs * lineSpacing + Math.max(0, lines.length - 1) * fs * paraGapEm) / 72;
    if (need <= hIn) return fs;
  }
  return min;
}

function rect(items: Prim[], x: number, y: number, w: number, h: number, color: string, o: { radius?: number; opacity?: number; stroke?: { color: string; width: number } } = {}) {
  items.push({ kind: "rect", x, y, w, h, color, radius: o.radius ?? 0, opacity: o.opacity ?? 1, stroke: o.stroke });
}

function circle(items: Prim[], x: number, y: number, d: number, color: string, opacity = 1) {
  items.push({ kind: "circle", x, y, d, color, opacity });
}

function text(items: Prim[], box: Box, content: string | string[], o: TextOpts) {
  const paragraphs = (Array.isArray(content) ? content : [content]).map((s) => (s ?? "").toString()).filter((s) => s.trim().length);
  items.push({
    kind: "text",
    ...box,
    paragraphs: paragraphs.length ? paragraphs : [" "],
    bullets: o.bullets ?? false,
    font: o.font ?? "body",
    size: o.size,
    bold: o.bold ?? false,
    italic: o.italic ?? false,
    color: o.color,
    opacity: o.opacity ?? 1,
    align: o.align ?? "left",
    valign: o.valign ?? "top",
    charSpacing: o.charSpacing,
    lineSpacing: o.lineSpacing ?? (o.bullets ? 1.3 : 1.2),
    paraGap: o.paraGap ?? (o.bullets ? 0.55 : 0.6),
  });
}

function card(items: Prim[], p: Palette, x: number, y: number, w: number, h: number, fill?: string) {
  rect(items, x, y, w, h, fill ?? p.surface, { radius: 0.12, stroke: !fill && p.strokeCards ? { color: p.line, width: 0.75 } : undefined });
}

function footer(items: Prim[], p: Palette, spec: DocumentSpec, n: number) {
  rect(items, MX, 7.02, 0.14, 0.14, p.strong, { radius: 0.02 });
  text(items, { x: MX + 0.26, y: 6.95, w: 8, h: 0.3 }, spec.title, { size: 9, color: p.muted, valign: "middle" });
  text(items, { x: SLIDE_W - MX - 1, y: 6.95, w: 1, h: 0.3 }, String(n), { size: 9, color: p.muted, align: "right", valign: "middle" });
}

function slideTitle(items: Prim[], p: Palette, title: string, subtitle?: string) {
  const fs = fitFont([title], CW, 0.8, 30, 20, 1.15);
  text(items, { x: MX, y: TITLE_Y, w: CW, h: 0.8 }, title, { font: "heading", size: fs, bold: true, color: p.text, valign: "bottom" });
  rect(items, MX, TITLE_Y + 0.9, 0.9, 0.06, p.strong, { radius: 0.02 });
  if (subtitle) text(items, { x: MX, y: TITLE_Y + 1.0, w: CW, h: 0.4 }, subtitle, { size: 13, color: p.muted });
}

function bulletList(items: Prim[], box: Box, list: string[], o: { size: number; color: string; font?: FontRole }) {
  text(items, box, list, { ...o, bullets: true });
}

/* ------------------------------------------------------------------ */
/*  Layouts                                                             */
/* ------------------------------------------------------------------ */

function cover(s: SlideScene, p: Palette, spec: DocumentSpec, b: Block) {
  s.bg = p.primary;
  circle(s.items, 8.4, -1.6, 6.8, p.secondary, 0.35);
  circle(s.items, 10.6, 3.9, 4.6, p.accent, 0.18);
  rect(s.items, MX, 1.85, 0.6, 0.06, p.accent, { radius: 0.02 });
  text(s.items, { x: MX + 0.75, y: 1.7, w: 6, h: 0.35 }, (spec.docType || "document").toUpperCase(), { size: 10.5, color: p.onPrimary, opacity: 0.8, charSpacing: 3, valign: "middle" });
  const title = b.title || spec.title;
  const fs = fitFont([title], 8.3, 2.3, 44, 28, 1.1);
  text(s.items, { x: MX, y: 2.15, w: 8.3, h: 2.3 }, title, { font: "heading", size: fs, bold: true, color: p.onPrimary, valign: "middle", lineSpacing: 1.1 });
  const sub = b.subtitle || spec.subtitle;
  if (sub) {
    const sfs = fitFont([sub], 8, 0.9, 18, 13, 1.25);
    text(s.items, { x: MX, y: 4.55, w: 8, h: 0.9 }, sub, { size: sfs, color: p.onPrimary, opacity: 0.85 });
  }
  const meta = [spec.author, spec.date].filter(Boolean).join("  ·  ");
  if (meta) text(s.items, { x: MX, y: 6.55, w: 8, h: 0.35 }, meta, { size: 11, color: p.onPrimary, opacity: 0.7, valign: "middle" });
}

function agenda(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title || "Agenda", b.subtitle);
  const list = b.bullets.slice(0, 10);
  const twoCol = list.length > 5;
  const perCol = twoCol ? Math.ceil(list.length / 2) : list.length;
  const colW = twoCol ? (CW - 0.5) / 2 : CW;
  const rowH = Math.min(0.85, BODY_H / Math.max(1, perCol));
  list.forEach((item, i) => {
    const col = twoCol ? Math.floor(i / perCol) : 0;
    const row = twoCol ? i % perCol : i;
    const x = MX + col * (colW + 0.5);
    const y = BODY_Y + row * rowH;
    circle(s.items, x, y + (rowH - 0.46) / 2, 0.46, p.strong);
    text(s.items, { x, y: y + (rowH - 0.46) / 2, w: 0.46, h: 0.46 }, String(i + 1), { font: "heading", size: 13, bold: true, color: p.onPrimary, align: "center", valign: "middle" });
    text(s.items, { x: x + 0.65, y, w: colW - 0.7, h: rowH }, item, { size: twoCol ? 15 : 17, color: p.text, valign: "middle" });
    if (row < perCol - 1) rect(s.items, x + 0.65, y + rowH - 0.01, colW - 0.7, 0.01, p.line);
  });
}

function section(s: SlideScene, p: Palette, b: Block, no: number) {
  s.bg = p.primary;
  rect(s.items, 0, 0, 4.6, SLIDE_H, p.secondary, { opacity: 0.4 });
  text(s.items, { x: 0.7, y: 2.3, w: 3.4, h: 2.4 }, String(no).padStart(2, "0"), { font: "heading", size: 96, bold: true, color: p.onPrimary, opacity: 0.3, valign: "middle" });
  const fs = fitFont([b.title], 7.6, 2, 40, 26, 1.1);
  text(s.items, { x: 5.2, y: 2.2, w: 7.6, h: 2 }, b.title, { font: "heading", size: fs, bold: true, color: p.onPrimary, valign: "middle", lineSpacing: 1.1 });
  if (b.subtitle) text(s.items, { x: 5.2, y: 4.3, w: 7.4, h: 0.9 }, b.subtitle, { size: 16, color: p.onPrimary, opacity: 0.8 });
}

function bullets(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const bodyY = b.subtitle ? BODY_Y + 0.35 : BODY_Y;
  const bodyH = b.subtitle ? BODY_H - 0.35 : BODY_H;
  const withCard = Boolean(b.callout) || (b.variant === 1 && b.bullets.length <= 5);
  const listW = withCard ? 7.4 : CW;
  const fs = fitFont(b.bullets, listW - 0.3, bodyH, 20, 14, 1.3, 0.6);
  bulletList(s.items, { x: MX, y: bodyY, w: listW, h: bodyH }, b.bullets, { size: fs, color: p.text });
  if (withCard) {
    const cx = MX + listW + 0.5;
    const cw = CW - listW - 0.5;
    const calloutText = b.callout ?? b.bullets[0];
    card(s.items, p, cx, bodyY, cw, bodyH, p.accent);
    rect(s.items, cx + 0.35, bodyY + 0.4, 0.5, 0.06, p.strong, { radius: 0.02 });
    text(s.items, { x: cx + 0.35, y: bodyY + 0.55, w: cw - 0.7, h: 0.3 }, (b.callout ? "Key takeaway" : "In focus").toUpperCase(), { size: 9.5, charSpacing: 2, color: p.muted, valign: "middle" });
    const cfs = fitFont([calloutText], cw - 0.7, bodyH - 1.4, 20, 14, 1.3);
    text(s.items, { x: cx + 0.35, y: bodyY + 0.95, w: cw - 0.7, h: bodyH - 1.3 }, calloutText, { font: "heading", size: cfs, bold: true, color: p.primary, lineSpacing: 1.25 });
  }
}

function twoColumn(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const cols = (b.columns ?? []).slice(0, 3);
  const gap = 0.4;
  const colW = (CW - gap * (cols.length - 1)) / cols.length;
  cols.forEach((c, i) => {
    const x = MX + i * (colW + gap);
    card(s.items, p, x, BODY_Y, colW, BODY_H);
    let y = BODY_Y + 0.35;
    if (c.heading) {
      rect(s.items, x + 0.35, y, 0.4, 0.06, p.strong, { radius: 0.02 });
      text(s.items, { x: x + 0.35, y: y + 0.12, w: colW - 0.7, h: 0.55 }, c.heading, { font: "heading", size: 17, bold: true, color: p.strong, valign: "middle" });
      y += 0.85;
    }
    const lines = c.bullets.length ? c.bullets : c.body ? [c.body] : [];
    const h = BODY_Y + BODY_H - y - 0.3;
    const fs = fitFont(lines, colW - 1, h, 16, 12, 1.3, 0.6);
    if (c.bullets.length) bulletList(s.items, { x: x + 0.35, y, w: colW - 0.7, h }, c.bullets, { size: fs, color: p.text });
    else if (c.body) text(s.items, { x: x + 0.35, y, w: colW - 0.7, h }, c.body.split(/\n{2,}/), { size: fs, color: p.text, lineSpacing: 1.3 });
  });
}

function groups(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const gs = (b.groups ?? []).slice(0, 3);
  const gap = 0.4;
  const colW = (CW - gap * (gs.length - 1)) / gs.length;
  gs.forEach((g, i) => {
    const x = MX + i * (colW + gap);
    card(s.items, p, x, BODY_Y, colW, BODY_H);
    let y = BODY_Y + 0.35;
    rect(s.items, x + 0.35, y, 0.4, 0.06, p.strong, { radius: 0.02 });
    const hfs = fitFont([g.heading], colW - 0.7, 0.7, 16, 12, 1.15);
    text(s.items, { x: x + 0.35, y: y + 0.12, w: colW - 0.7, h: 0.7 }, g.heading, { font: "heading", size: hfs, bold: true, color: p.strong, valign: "middle", lineSpacing: 1.1 });
    y += 0.95;
    if (g.meta) {
      text(s.items, { x: x + 0.35, y, w: colW - 0.7, h: 0.32 }, g.meta, { size: 11, color: p.muted, valign: "middle" });
      y += 0.4;
    }
    const lines = g.bullets.length ? g.bullets : g.body ? [g.body] : [];
    const h = BODY_Y + BODY_H - y - 0.3;
    const fs = fitFont(lines, colW - 1, h, 15, 11, 1.3, 0.55);
    if (g.bullets.length) bulletList(s.items, { x: x + 0.35, y, w: colW - 0.7, h }, g.bullets, { size: fs, color: p.text });
    else if (g.body) text(s.items, { x: x + 0.35, y, w: colW - 0.7, h }, g.body, { size: fs, color: p.text, lineSpacing: 1.3 });
  });
}

function stats(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const list = (b.stats ?? []).slice(0, 4);
  const gap = 0.35;
  const cw = (CW - gap * (list.length - 1)) / list.length;
  const extra = b.callout ?? b.body ?? (b.bullets.length ? b.bullets.join("  ·  ") : undefined);
  const ch = extra ? 3.1 : 3.6;
  const y = BODY_Y + 0.2;
  list.forEach((st, i) => {
    const x = MX + i * (cw + gap);
    card(s.items, p, x, y, cw, ch);
    rect(s.items, x, y + 0.3, 0.07, 0.7, p.strong, { radius: 0.02 });
    const vfs = fitFont([st.value], cw - 0.6, 1.1, st.value.length > 8 ? 34 : 44, 18, 1.05);
    text(s.items, { x: x + 0.3, y: y + 0.3, w: cw - 0.6, h: 1.1 }, st.value, { font: "heading", size: vfs, bold: true, color: p.strong, valign: "middle" });
    text(s.items, { x: x + 0.3, y: y + 1.45, w: cw - 0.6, h: 0.6 }, st.label, { size: 13, bold: true, color: p.text });
    if (st.description) text(s.items, { x: x + 0.3, y: y + 2.0, w: cw - 0.6, h: ch - 2.2 }, st.description, { size: 11, color: p.muted });
  });
  if (extra) {
    const ey = y + ch + 0.3;
    rect(s.items, MX, ey, 0.07, 0.9, p.strong, { radius: 0.02 });
    const efs = fitFont([extra], CW - 0.4, 1.2, 15, 12, 1.3);
    text(s.items, { x: MX + 0.3, y: ey, w: CW - 0.4, h: 1.2 }, extra, { size: efs, color: p.text, valign: "middle" });
  }
}

function quote(s: SlideScene, p: Palette, b: Block) {
  s.bg = p.dark ? p.bg : p.surface;
  rect(s.items, 0, 0, 0.35, SLIDE_H, p.strong);
  text(s.items, { x: 1.0, y: 0.6, w: 2, h: 2 }, "\u201C", { font: "serif", size: 140, bold: true, color: p.strong, opacity: 0.18 });
  const q = b.quote?.text ?? b.bullets[0] ?? b.body ?? "";
  const fs = fitFont([q], 10.4, 3.0, 30, 18, 1.3);
  text(s.items, { x: 1.5, y: 2.1, w: 10.4, h: 3.0 }, q, { font: "serif", size: fs, italic: true, color: p.text, valign: "middle", lineSpacing: 1.3 });
  if (b.quote?.attribution) {
    rect(s.items, 1.5, 5.35, 0.5, 0.05, p.strong);
    text(s.items, { x: 2.15, y: 5.18, w: 9, h: 0.4 }, b.quote.attribution, { size: 14, color: p.muted, valign: "middle" });
  }
  text(s.items, { x: 1.5, y: 0.6, w: 10, h: 0.35 }, b.title.toUpperCase(), { size: 10, charSpacing: 2, color: p.muted, valign: "middle" });
}

function timeline(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const steps = (b.steps ?? []).slice(0, 5);
  const n = steps.length;
  const lineY = 3.55;
  rect(s.items, MX + 0.3, lineY - 0.02, CW - 0.6, 0.05, p.line);
  const slotW = CW / n;
  steps.forEach((st, i) => {
    const cx = MX + slotW * i + slotW / 2;
    circle(s.items, cx - 0.3, lineY - 0.3, 0.6, p.strong);
    text(s.items, { x: cx - 0.3, y: lineY - 0.3, w: 0.6, h: 0.6 }, String(i + 1), { font: "heading", size: 14, bold: true, color: p.onPrimary, align: "center", valign: "middle" });
    const lfs = fitFont([st.label], slotW - 0.3, 1.0, 16, 12, 1.2);
    text(s.items, { x: cx - slotW / 2 + 0.15, y: lineY - 1.55, w: slotW - 0.3, h: 1.05 }, st.label, { font: "heading", size: lfs, bold: true, color: p.text, align: "center", valign: "bottom", lineSpacing: 1.15 });
    if (st.description) {
      const dfs = fitFont([st.description], slotW - 0.3, 2.2, 13, 10.5, 1.3);
      text(s.items, { x: cx - slotW / 2 + 0.15, y: lineY + 0.55, w: slotW - 0.3, h: 2.3 }, st.description, { size: dfs, color: p.muted, align: "center", lineSpacing: 1.3 });
    }
  });
  if (b.callout) text(s.items, { x: MX, y: 6.15, w: CW, h: 0.6 }, b.callout, { size: 13, italic: true, color: p.strong, align: "center", valign: "middle" });
}

function comparison(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const cols = (b.columns ?? []).slice(0, 2);
  const gap = 0.4;
  const colW = (CW - gap) / 2;
  cols.forEach((c, i) => {
    const x = MX + i * (colW + gap);
    const head = i === 0 ? p.primary : p.secondary;
    card(s.items, p, x, BODY_Y, colW, BODY_H);
    rect(s.items, x, BODY_Y, colW, 0.7, head, { radius: 0.12 });
    rect(s.items, x, BODY_Y + 0.4, colW, 0.3, head);
    text(s.items, { x: x + 0.3, y: BODY_Y, w: colW - 0.6, h: 0.7 }, c.heading ?? (i === 0 ? "Option A" : "Option B"), { font: "heading", size: 16, bold: true, color: p.onPrimary, valign: "middle" });
    const fs = fitFont(c.bullets, colW - 0.9, BODY_H - 1.2, 16, 12, 1.3, 0.6);
    bulletList(s.items, { x: x + 0.3, y: BODY_Y + 1.0, w: colW - 0.6, h: BODY_H - 1.2 }, c.bullets, { size: fs, color: p.text });
  });
}

function table(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const t = b.table!;
  const cols = t.headers.length || t.rows[0]?.length || 1;
  const size = cols > 4 || t.rows.length > 5 ? 11 : 13;
  s.items.push({
    kind: "table",
    x: MX,
    y: BODY_Y,
    w: CW,
    colW: Array(cols).fill(CW / cols) as number[],
    headers: t.headers.some(Boolean) ? t.headers : [],
    rows: t.rows,
    size,
    font: "body",
    headerFill: p.surface,
    headerColor: p.text,
    headerRule: p.strong,
    textColor: p.text,
    rowRule: p.line,
    fill: p.bg,
  });
  if (b.callout) text(s.items, { x: MX, y: 6.3, w: CW, h: 0.5 }, b.callout, { size: 12, italic: true, color: p.muted, valign: "middle" });
}

function quiz(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title || "Quiz", b.subtitle);
  const qs = (b.quiz ?? []).slice(0, 4);
  const letters = ["A", "B", "C", "D"];
  const gap = 0.35;
  const colW = (CW - gap) / 2;
  qs.forEach((q, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MX + col * (colW + gap);
    const y = BODY_Y + row * (BODY_H / 2 + 0.15);
    const h = BODY_H / 2 - 0.15;
    card(s.items, p, x, y, colW, h);
    const qfs = fitFont([q.question], colW - 0.7, 0.9, 13, 11, 1.2);
    text(s.items, { x: x + 0.3, y: y + 0.3, w: colW - 0.6, h: 0.9 }, `${i + 1}. ${q.question}`, { size: qfs, bold: true, color: p.text, lineSpacing: 1.2 });
    const opts = q.type === "identification" ? ["Answer: ______"] : q.options.length ? q.options.map((o, oi) => `${letters[oi] ?? oi + 1}. ${o}`) : ["True", "False"].map((o, oi) => `${letters[oi]}. ${o}`);
    const ofs = fitFont(opts, colW - 0.9, h - 1.4, 11, 9, 1.25);
    bulletList(s.items, { x: x + 0.3, y: y + 1.25, w: colW - 0.6, h: h - 1.35 }, opts, { size: ofs, color: p.muted });
  });
}

function paragraph(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const paras = (b.body ?? b.bullets.join("\n\n")).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const hasCallout = Boolean(b.callout);
  const bodyH = hasCallout ? BODY_H - 1.1 : BODY_H;
  const fs = fitFont(paras, CW - 0.6, bodyH, 18, 12, 1.35, 0.8);
  rect(s.items, MX, BODY_Y + 0.05, 0.07, Math.min(bodyH - 0.2, 1.4), p.strong, { radius: 0.02 });
  text(s.items, { x: MX + 0.35, y: BODY_Y, w: CW - 0.35, h: bodyH }, paras, { size: fs, color: p.text, lineSpacing: 1.35, paraGap: 0.8 });
  if (hasCallout) {
    const cy = BODY_Y + bodyH + 0.2;
    card(s.items, p, MX, cy, CW, 0.85, p.accent);
    text(s.items, { x: MX + 0.35, y: cy, w: CW - 0.7, h: 0.85 }, b.callout!, { font: "heading", size: 14, bold: true, color: p.primary, valign: "middle" });
  }
}

function closing(s: SlideScene, p: Palette, spec: DocumentSpec, b: Block) {
  s.bg = p.primary;
  circle(s.items, -1.8, 4.2, 5.2, p.secondary, 0.35);
  circle(s.items, 10.9, -1.4, 4.2, p.accent, 0.18);
  const fs = fitFont([b.title], 7.6, 1.3, 40, 26, 1.1);
  text(s.items, { x: MX, y: 0.75, w: 7.8, h: 1.3 }, b.title, { font: "heading", size: fs, bold: true, color: p.onPrimary, valign: "middle", lineSpacing: 1.1 });
  rect(s.items, MX, 2.15, 0.9, 0.06, p.accent, { radius: 0.02 });
  const hasCallout = Boolean(b.callout);
  const listW = hasCallout ? 7.2 : CW;
  const list = b.bullets.length ? b.bullets : b.body ? b.body.split(/\n{2,}/) : [];
  if (list.length) {
    const bfs = fitFont(list, listW - 0.3, 3.9, 18, 13, 1.3, 0.6);
    bulletList(s.items, { x: MX, y: 2.5, w: listW, h: 3.9 }, list, { size: bfs, color: p.onPrimary });
  }
  if (hasCallout) {
    const cx = MX + listW + 0.5;
    const cw = CW - listW - 0.5;
    rect(s.items, cx, 2.5, cw, 3.7, p.onPrimary, { opacity: 0.14, radius: 0.12 });
    const cfs = fitFont([b.callout!], cw - 0.7, 2.7, 20, 14, 1.3);
    text(s.items, { x: cx + 0.35, y: 2.8, w: cw - 0.7, h: 3.1 }, b.callout!, { font: "heading", size: cfs, bold: true, color: p.onPrimary, valign: "middle", lineSpacing: 1.25 });
  }
  const meta = [spec.author, spec.date].filter(Boolean).join("  ·  ");
  text(s.items, { x: MX, y: 6.55, w: 10, h: 0.35 }, meta || spec.title, { size: 11, color: p.onPrimary, opacity: 0.7, valign: "middle" });
}

/* ------------------------------------------------------------------ */
/*  Entry                                                               */
/* ------------------------------------------------------------------ */

export function buildDeck(spec: DocumentSpec): DeckScene {
  const t = getTheme(spec.theme);
  const p = palette(t);
  const slides: SlideScene[] = [];
  let sectionNo = 0;

  spec.blocks.forEach((b, i) => {
    const s: SlideScene = { bg: p.bg, items: [], notes: b.notes };
    const n = i + 1;
    switch (b.layout) {
      case "cover":
        cover(s, p, spec, b);
        break;
      case "agenda":
        agenda(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "section":
        sectionNo += 1;
        section(s, p, b, sectionNo);
        break;
      case "two-column":
        twoColumn(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "groups":
        groups(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "stats":
        stats(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "quote":
        quote(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "timeline":
        timeline(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "comparison":
        comparison(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "table":
        table(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "paragraph":
        paragraph(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "quiz":
        quiz(s, p, b);
        footer(s.items, p, spec, n);
        break;
      case "closing":
        closing(s, p, spec, b);
        break;
      default:
        if (b.quiz?.length) {
          quiz(s, p, b);
        } else {
          bullets(s, p, b);
        }
        footer(s.items, p, spec, n);
    }
    slides.push(s);
  });

  return { slides, fonts: t.fonts };
}
