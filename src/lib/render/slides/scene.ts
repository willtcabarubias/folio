import { resolveDesign } from "@/lib/design/resolver";
import { getTheme, type Theme } from "@/lib/spec/themes";
import type { Block, DocumentSpec } from "@/lib/spec/types";

/* ------------------------------------------------------------------ */
/*  Geometry (inches, 16:9) — editorial air                            */
/* ------------------------------------------------------------------ */

export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;
const MX = 0.75;
const CW = SLIDE_W - MX * 2;
const TITLE_Y = 0.62;
const BODY_Y = 1.92;
const BODY_H = 4.78;

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
    lineSpacing: o.lineSpacing ?? (o.bullets ? 1.32 : 1.28),
    paraGap: o.paraGap ?? (o.bullets ? 0.7 : 0.65),
  });
}

function card(items: Prim[], p: Palette, x: number, y: number, w: number, h: number, fill?: string) {
  rect(items, x, y, w, h, fill ?? p.surface, { radius: 0.12, stroke: !fill && p.strokeCards ? { color: p.line, width: 0.75 } : undefined });
}

function footer(items: Prim[], p: Palette, spec: DocumentSpec, n: number) {
  rect(items, MX, 7.02, CW, 0.015, p.line, { opacity: 0.45 });
  text(items, { x: MX, y: 7.12, w: CW, h: 0.22 }, String(n), { size: 7, color: p.muted, align: "center", valign: "middle" });
}

function slideTitle(items: Prim[], p: Palette, title: string, subtitle?: string) {
  // Editorial: big condensed heading, no thick dash — air gap does the work (refs have no pin)
  const fs = fitFont([title], CW, 0.82, 32, 22, 1.08);
  text(items, { x: MX, y: TITLE_Y, w: CW, h: 0.82 }, title, { font: "heading", size: fs, bold: true, color: p.text, valign: "bottom", lineSpacing: 1.05 });
  if (subtitle) text(items, { x: MX, y: TITLE_Y + 0.92, w: CW, h: 0.42 }, subtitle, { size: 12.5, color: p.muted, lineSpacing: 1.25 });
}

function bulletList(items: Prim[], box: Box, list: string[], o: { size: number; color: string; font?: FontRole }) {
  text(items, box, list, { ...o, bullets: true });
}

/* ------------------------------------------------------------------ */
/*  Layouts                                                             */
/* ------------------------------------------------------------------ */

// Conditional decoration: thin wavy-ish hairlines in corners, only when whitespace is generous
function maybeDecorate(s: SlideScene, p: Palette, need: boolean) {
  if (!need) return;
  // top-right: 5 faint horizontal hairlines fanning slightly
  const baseX = SLIDE_W - 0.92;
  for (let i = 0; i < 5; i++) {
    const yy = 0.18 + i * 0.07;
    rect(s.items, baseX + i * 0.02, yy, 0.68 - i * 0.06, 0.01, p.line, { opacity: 0.28 });
  }
  // bottom-left mirroring
  for (let i = 0; i < 4; i++) {
    const yy = SLIDE_H - 0.34 + i * 0.07;
    rect(s.items, 0.18 + i * 0.02, yy, 0.6 - i * 0.05, 0.01, p.line, { opacity: 0.26 });
  }
}

// Deterministic header variant rotation: hash title
function pickHeaderVariant(spec: DocumentSpec): 1 | 2 {
  let h = 0;
  const s = spec.title + (spec.subtitle ?? "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  // Also oscillate by blocks count to give variety across decks
  const tweak = spec.blocks.length % 2;
  return ((h + tweak) % 2 === 0 ? 1 : 2) as 1 | 2;
}

function estimatedHeight(lines: string[], wIn: number, fs: number, lineSpacing = 1.0, paraGapEm = 0): number {
  const cpl = Math.max(8, Math.floor((wIn * 72) / (fs * 0.52)));
  let total = 0;
  for (const l of lines) total += Math.max(1, Math.ceil(l.length / cpl));
  return (total * fs * lineSpacing + Math.max(0, lines.length - 1) * fs * paraGapEm) / 72;
}

function coverLight(s: SlideScene, p: Palette, spec: DocumentSpec, b: Block) {
  // pptxheader1.png — centered huge, 3 pill outlines (mood bg, no date)
  s.bg = p.bg;
  rect(s.items, MX, 0.55, CW, 0.015, p.line, { opacity: 0.55 });
  text(s.items, { x: MX, y: 0.28, w: CW, h: 0.22 }, (spec.docType || "Folio").toUpperCase(), { size: 7, color: p.muted, charSpacing: 1.2 });
  const title = (b.title || spec.title).toUpperCase();
  const fs = fitFont([title], 9.6, 2.35, 56, 28, 1.0);
  const titleH = estimatedHeight([title], 9.6, fs, 0.98, 0);
  // Title block: centered vertically but height capped; place pills dynamically below title
  const titleY = 1.95;
  const titleBoxH = Math.min(2.45, Math.max(1.2, titleH + 0.35));
  text(s.items, { x: MX, y: titleY, w: CW, h: titleBoxH }, title, { font: "heading", size: fs, bold: true, color: p.text, align: "center", valign: "middle", lineSpacing: 0.98, charSpacing: -0.35 });
  const pills: string[] = [];
  if (b.subtitle) pills.push(b.subtitle.toUpperCase());
  if (b.bullets?.length) pills.push(...b.bullets.slice(0, 2).map((x) => x.toUpperCase()));
  if (!pills.length) pills.push(spec.docType.toUpperCase());
  const pillSlice = pills.slice(0, 3);
  const pillH = 0.32;
  const pillGap = 0.22;
  const pillWs = pillSlice.map((t) => Math.min(2.8, Math.max(1.4, t.length * 0.085 + 0.5)));
  const totalW = pillWs.reduce((a, w) => a + w, 0) + pillGap * (pillWs.length - 1);
  let px = MX + (CW - totalW) / 2;
  // Dynamic pill Y: at least 0.32 below title box, clamped before bottom rule 6.92 with 0.6 clearance
  let py = titleY + titleBoxH + 0.32;
  if (py < 4.42) py = 4.42;
  if (py + pillH > 6.32) py = 6.32 - pillH;
  pillSlice.forEach((t) => {
    const w = pillWs[pillSlice.indexOf(t)];
    rect(s.items, px, py, w, pillH, p.bg, { radius: 0.16, stroke: { color: p.line, width: 0.7 } });
    text(s.items, { x: px, y: py, w, h: pillH }, t.slice(0, 24), { size: 7, color: p.text, bold: true, align: "center", valign: "middle", charSpacing: 0.6 });
    px += w + pillGap;
  });
  rect(s.items, MX, 6.92, CW, 0.015, p.line, { opacity: 0.55 });
  const footerTxt = (spec.author || spec.subtitle || "").trim().slice(0, 40);
  if (footerTxt) text(s.items, { x: MX, y: 7.02, w: CW, h: 0.22 }, footerTxt, { size: 7, color: p.muted, align: "center" });
}

function coverDark(s: SlideScene, p: Palette, spec: DocumentSpec, b: Block) {
  // pptxheader2.png — left-stacked 2-line title, mood-consistent bg (no hard-coded black/cream, no dummy text)
  s.bg = p.bg;
  rect(s.items, MX, 0.55, CW, 0.015, p.line, { opacity: p.dark ? 0.28 : 0.55 });
  text(s.items, { x: MX, y: 0.28, w: CW, h: 0.22 }, (spec.docType || "Folio").toUpperCase(), { size: 7, color: p.muted, charSpacing: 1.2 });
  const raw = (b.title || spec.title).toUpperCase();
  const parts = raw.split(/\s+/);
  const topWord = parts.slice(0, Math.ceil(parts.length / 2)).join(" ");
  const bottomWord = parts.slice(Math.ceil(parts.length / 2)).join(" ");
  const topFs = fitFont([topWord || raw], CW * 0.85, 1.25, 58, 30, 0.98);
  const botFs = fitFont([bottomWord || raw], CW * 0.6, 0.85, 42, 24, 1.0);
  const topH = estimatedHeight([topWord || raw], CW * 0.85, topFs, 0.95, 0);
  const botH = bottomWord ? estimatedHeight([bottomWord], CW * 0.6, botFs, 0.95, 0) : 0;
  text(s.items, { x: MX, y: 1.85, w: CW * 0.85, h: 1.35 }, topWord || raw, { font: "heading", size: topFs, bold: true, color: p.text, lineSpacing: 0.95, charSpacing: -0.4 });
  if (bottomWord) text(s.items, { x: MX, y: 3.15, w: CW * 0.6, h: 0.85 }, bottomWord, { font: "heading", size: botFs, bold: true, color: p.text, lineSpacing: 0.95, charSpacing: -0.35 });
  // pills — dynamic below stacked title, mood stroke
  if (b.subtitle) {
    const pillW = Math.min(2.8, Math.max(1.4, b.subtitle.length * 0.085 + 0.6));
    let py = 1.85 + topH + botH + 0.45;
    if (py < 4.42) py = 4.42;
    if (py + 0.32 > 6.32) py = 6.32 - 0.32;
    rect(s.items, MX, py, pillW, 0.32, p.bg, { radius: 0.16, stroke: { color: p.line, width: 0.7 } });
    text(s.items, { x: MX, y: py, w: pillW, h: 0.32 }, b.subtitle.toUpperCase().slice(0, 24), { size: 7, color: p.text, bold: true, align: "center", valign: "middle", charSpacing: 0.6 });
  }
  rect(s.items, MX, 6.92, CW, 0.015, p.line, { opacity: p.dark ? 0.28 : 0.55 });
  const footerTxt = (spec.author || spec.subtitle || "").trim().slice(0, 40);
  if (footerTxt) text(s.items, { x: MX, y: 7.02, w: CW, h: 0.22 }, footerTxt, { size: 7, color: p.muted, align: "center" });
}

function cover(s: SlideScene, p: Palette, spec: DocumentSpec, b: Block) {
  const variant = pickHeaderVariant(spec);
  if (variant === 2) {
    coverDark(s, p, spec, b);
    return;
  }
  coverLight(s, p, spec, b);
}

function agenda(s: SlideScene, p: Palette, b: Block) {
  // Editorial TOC: normalcontent density + decoration token (SKILLS hairlines + corner wavy)
  slideTitle(s.items, p, b.title || "Agenda", b.subtitle);
  maybeDecorate(s, p, true);
  // If subtitle exists, render it as muted lead below title (normalcontent style) before list
  let listY = BODY_Y;
  if (b.subtitle) {
    // subtitle already in header, but if Agenda has extra subtitle lead, shift list down slightly handled by slideTitle BODY_Y offset; keep 0.42 gap already in slideTitle
    listY = BODY_Y + 0.02;
  }
  const bodyH = BODY_H - (listY - BODY_Y);
  const list = b.bullets.slice(0, 10);
  const twoCol = list.length > 5;
  const perCol = twoCol ? Math.ceil(list.length / 2) : list.length;
  const colW = twoCol ? (CW - 0.48) / 2 : CW;
  // Slightly tighter rowH for airy list
  const rowH = Math.min(0.78, bodyH / Math.max(1, perCol));
  list.forEach((item, i) => {
    const col = twoCol ? Math.floor(i / perCol) : 0;
    const row = twoCol ? i % perCol : i;
    const x = MX + col * (colW + 0.48);
    const y = listY + row * rowH;
    // Black square number (like separatordesign/timeline)
    const sq = 0.38;
    rect(s.items, x, y + (rowH - sq) / 2, sq, sq, p.text);
    text(s.items, { x, y: y + (rowH - sq) / 2, w: sq, h: sq }, String(i + 1).padStart(2, "0"), { font: "heading", size: 10, bold: true, color: p.bg, align: "center", valign: "middle" });
    // Title with hairline below like decoration.png SKILLS — horizontal rule after each row (except last)
    const fs = twoCol ? 13.5 : 15;
    text(s.items, { x: x + 0.58, y, w: colW - 0.66, h: rowH }, item, { size: fs, color: p.text, valign: "middle", lineSpacing: 1.22 });
    if (row < perCol - 1) rect(s.items, x + 0.58, y + rowH - 0.012, colW - 0.66, 0.012, p.line, { opacity: 0.35 });
  });
}

function section(s: SlideScene, p: Palette, b: Block, no: number) {
  s.bg = p.primary;
  rect(s.items, 0, 0, 4.6, SLIDE_H, p.secondary, { opacity: 0.38 });
  text(s.items, { x: 0.7, y: 2.3, w: 3.4, h: 2.4 }, String(no).padStart(2, "0"), { font: "heading", size: 96, bold: true, color: p.onPrimary, opacity: 0.18, valign: "middle" });
  const fs = fitFont([b.title], 7.6, 2, 40, 26, 1.1);
  text(s.items, { x: 5.2, y: 2.2, w: 7.6, h: 2 }, b.title, { font: "heading", size: fs, bold: true, color: p.onPrimary, valign: "middle", lineSpacing: 1.1 });
  if (b.subtitle) text(s.items, { x: 5.2, y: 4.3, w: 7.4, h: 0.9 }, b.subtitle, { size: 15, color: p.onPrimary, opacity: 0.78 });
}

// Editorial bullets — clean, airy, no card/callout unless explicitly in b.callout
function bullets(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const bodyY = b.subtitle ? BODY_Y + 0.42 : BODY_Y;
  const bodyH = b.subtitle ? BODY_H - 0.42 : BODY_H;
  // large type, short lines — 17→15pt, no card
  const fs = fitFont(b.bullets, CW - 0.36, bodyH, 18, 14, 1.32, 0.7);
  bulletList(s.items, { x: MX, y: bodyY, w: CW, h: bodyH }, b.bullets, { size: fs, color: p.text });
  // Optional callout footer — thin muted italic, only if model explicitly provided one
  if (b.callout) {
    rect(s.items, MX, BODY_Y + BODY_H - 0.02, CW, 0.012, p.line, { opacity: 0.4 });
    text(s.items, { x: MX, y: BODY_Y + BODY_H + 0.14, w: CW, h: 0.42 }, b.callout, { size: 10, italic: true, color: p.muted, valign: "middle" });
  }
  const needDecor = b.bullets.length <= 3 && !b.subtitle;
  maybeDecorate(s, p, needDecor);
}

// Two/three column unified — same hairline tokens for 2 or 3 cols
function twoColumn(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const cols = (b.columns ?? []).slice(0, 3);
  const n = cols.length || 0;
  if (n === 0) return;
  const gap = n === 3 ? 0.32 : 0.4;
  const colW = (CW - gap * (n - 1)) / n;
  rect(s.items, MX, BODY_Y - 0.04, CW, 0.015, p.line, { opacity: 0.55 });
  cols.forEach((c, i) => {
    const x = MX + i * (colW + gap);
    if (i > 0) rect(s.items, x - gap / 2, BODY_Y, 0.015, BODY_H, p.line, { opacity: 0.42 });
    let y = BODY_Y + 0.35;
    if (c.heading) {
      text(s.items, { x, y: y + 0.1, w: colW, h: 0.52 }, c.heading.toUpperCase(), { font: "heading", size: 11, bold: true, color: p.text, valign: "middle", charSpacing: 0.65 });
      rect(s.items, x, y + 0.68, colW, 0.012, p.line, { opacity: 0.48 });
      y += 0.84;
    }
    const lines = c.bullets.length ? c.bullets : c.body ? [c.body] : [];
    const h = BODY_Y + BODY_H - y - 0.18;
    const fs = fitFont(lines, colW - 0.9, h, 15.5, 11.5, 1.32, 0.62);
    if (c.bullets.length) bulletList(s.items, { x: x + 0.28, y, w: colW - 0.56, h }, c.bullets, { size: fs, color: p.text });
    else if (c.body) text(s.items, { x: x + 0.28, y, w: colW - 0.56, h }, c.body.split(/\n{2,}/), { size: fs, color: p.text, lineSpacing: 1.32 });
  });
  if (b.callout) text(s.items, { x: MX, y: BODY_Y + BODY_H + 0.14, w: CW, h: 0.38 }, b.callout, { size: 10, italic: true, color: p.muted, align: "center" });
}

// Groups — editorial boxed grid (separatordesign.png) + pricing 4-col (mutiplecolumn.png)
function groups(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const gs = (b.groups ?? []).slice(0, 4);
  const n = gs.length;
  const gap = n === 4 ? 0.22 : 0.32;
  // 4-col pricing needs tighter columns
  const colW = (CW - gap * (n - 1)) / n;
  gs.forEach((g, i) => {
    const x = MX + i * (colW + gap);
    // Uniform thin stroke box — no fill variance, radius ~0.08
    rect(s.items, x, BODY_Y, colW, BODY_H, p.bg, { radius: 0.09, stroke: { color: p.text, width: 0.7 } });
    // Title centered
    const hfs = fitFont([g.heading], colW - 0.5, 0.62, n === 4 ? 12 : 13, 10, 1.1);
    text(s.items, { x: x + 0.22, y: BODY_Y + 0.42, w: colW - 0.44, h: 0.62 }, g.heading, { font: "heading", size: hfs, bold: true, color: p.text, align: "center", valign: "middle", lineSpacing: 1.05 });
    // Short centered dash under title like separatordesign
    rect(s.items, x + colW / 2 - 0.14, BODY_Y + 1.12, 0.28, 0.035, p.text);
    let y = BODY_Y + 1.38;
    if (g.meta) {
      text(s.items, { x: x + 0.22, y, w: colW - 0.44, h: 0.28 }, g.meta, { size: 8.5, color: p.muted, align: "center", valign: "middle", charSpacing: 0.4 });
      y += 0.36;
    }
    const lines = g.bullets.length ? g.bullets : g.body ? [g.body] : [];
    const h = BODY_Y + BODY_H - y - 0.38;
    const fs = fitFont(lines, colW - 0.56, h, n === 4 ? 9.5 : 11, 8, 1.3, 0.55);
    if (g.bullets.length) {
      // For pricing 4-col, bullets are description — render as centered muted text, not left bullets
      if (n === 4) text(s.items, { x: x + 0.22, y, w: colW - 0.44, h }, g.bullets, { size: fs, color: p.muted, align: "center", lineSpacing: 1.3, paraGap: 0.45 });
      else bulletList(s.items, { x: x + 0.28, y, w: colW - 0.56, h }, g.bullets, { size: fs, color: p.muted });
    } else if (g.body) text(s.items, { x: x + 0.22, y, w: colW - 0.44, h }, g.body, { size: fs, color: p.muted, align: "center", lineSpacing: 1.3 });
    // Pricing pill: if 4-col and meta suggests price, show bottom pill "Select" like ref
    if (n === 4) {
      const pillW = 1.05;
      const pillX = x + (colW - pillW) / 2;
      const pillY = BODY_Y + BODY_H - 0.52;
      const isActive = i === 1; // second card highlighted like $25 dark in ref
      rect(s.items, pillX, pillY, pillW, 0.28, isActive ? p.text : p.bg, { radius: 0.14, stroke: { color: p.text, width: 0.7 } });
      text(s.items, { x: pillX, y: pillY, w: pillW, h: 0.28 }, "Select", { size: 8, bold: true, color: isActive ? p.bg : p.text, align: "center", valign: "middle" });
    }
  });
  if (b.callout) text(s.items, { x: MX, y: BODY_Y + BODY_H + 0.14, w: CW, h: 0.38 }, b.callout, { size: 10, italic: true, color: p.muted, align: "center" });
}

function stats(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const list = (b.stats ?? []).slice(0, 4);
  const n = list.length;
  const gap = 0.28;
  const cw = (CW - gap * (n - 1)) / n;
  const ch = 2.95;
  const y = BODY_Y + 0.14;
  list.forEach((st, i) => {
    const x = MX + i * (cw + gap);
    // Minimal card: thin stroke, no strong bar, cream fill
    rect(s.items, x, y, cw, ch, p.bg, { radius: 0.11, stroke: { color: p.line, width: 0.7 } });
    // Tiny top hairline accent (not thick pin)
    rect(s.items, x + 0.22, y + 0.24, 0.32, 0.016, p.text, { opacity: 0.9 });
    const vfs = fitFont([st.value], cw - 0.5, 0.95, st.value.length > 8 ? 28 : 36, 18, 1.02);
    text(s.items, { x: x + 0.22, y: y + 0.38, w: cw - 0.44, h: 0.95 }, st.value, { font: "heading", size: vfs, bold: true, color: p.text, valign: "middle" });
    text(s.items, { x: x + 0.22, y: y + 1.42, w: cw - 0.44, h: 0.48 }, st.label, { size: 11, bold: true, color: p.text, lineSpacing: 1.1 });
    if (st.description) text(s.items, { x: x + 0.22, y: y + 1.98, w: cw - 0.44, h: ch - 2.12 }, st.description, { size: 9, color: p.muted, lineSpacing: 1.3 });
  });
  // No extra strip — callout only if explicitly supplied and caller wants it (rendered as muted footer)
  if (b.callout) text(s.items, { x: MX, y: y + ch + 0.22, w: CW, h: 0.45 }, b.callout, { size: 10, italic: true, color: p.muted, align: "center", valign: "middle" });
}

function quote(s: SlideScene, p: Palette, b: Block) {
  // Keep editorial quote: light bg, serif quote mark faint, no full-height strong bar
  s.bg = p.dark ? p.bg : p.surface;
  text(s.items, { x: 1.0, y: 0.72, w: 2, h: 1.7 }, "\u201C", { font: "serif", size: 110, bold: true, color: p.text, opacity: 0.1 });
  const q = b.quote?.text ?? b.bullets[0] ?? b.body ?? "";
  const fs = fitFont([q], 10.4, 3.0, 28, 17, 1.32);
  text(s.items, { x: 1.5, y: 2.1, w: 10.4, h: 3.0 }, q, { font: "serif", size: fs, italic: true, color: p.text, valign: "middle", lineSpacing: 1.32 });
  if (b.quote?.attribution) {
    rect(s.items, 1.5, 5.28, 0.42, 0.02, p.line, { opacity: 0.5 });
    text(s.items, { x: 2.05, y: 5.15, w: 9, h: 0.38 }, b.quote.attribution, { size: 11, color: p.muted, valign: "middle" });
  }
  text(s.items, { x: 1.5, y: 0.52, w: 10, h: 0.32 }, b.title.toUpperCase(), { size: 8.5, charSpacing: 1.4, color: p.muted, valign: "middle" });
}

function timeline(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const steps = (b.steps ?? []).slice(0, 5);
  const n = steps.length;
  const lineY = 3.58;
  // Single hairline with arrow tip like THE DESIGN JOURNEY
  rect(s.items, MX + 0.28, lineY - 0.015, CW - 0.56, 0.03, p.line, { opacity: 0.9 });
  rect(s.items, MX + CW - 0.28, lineY - 0.055, 0.12, 0.015, p.line, { opacity: 0.9 });
  rect(s.items, MX + CW - 0.31, lineY - 0.09, 0.1, 0.015, p.line, { opacity: 0.9 });
  const slotW = CW / n;
  steps.forEach((st, i) => {
    const cx = MX + slotW * i + slotW / 2;
    rect(s.items, cx - 0.26, lineY - 0.26, 0.52, 0.52, p.text);
    text(s.items, { x: cx - 0.26, y: lineY - 0.26, w: 0.52, h: 0.52 }, String(i + 1).padStart(2, "0"), { font: "heading", size: 12, bold: true, color: p.bg, align: "center", valign: "middle" });
    // Label BELOW line like ref (not above)
    const lfs = fitFont([st.label], slotW - 0.42, 0.62, 12.5, 10, 1.15);
    text(s.items, { x: cx - slotW / 2 + 0.2, y: lineY + 0.38, w: slotW - 0.4, h: 0.62 }, st.label, { font: "heading", size: lfs, bold: true, color: p.text, align: "center", valign: "top", lineSpacing: 1.1 });
    if (st.description) {
      const dfs = fitFont([st.description], slotW - 0.42, 1.65, 10.5, 8.5, 1.28);
      // Bullets under label: use small left-inset bullet text but centered block
      text(s.items, { x: cx - slotW / 2 + 0.2, y: lineY + 1.06, w: slotW - 0.4, h: 1.7 }, st.description, { size: dfs, color: p.muted, align: "left", lineSpacing: 1.28 });
      // If multiple sentences, render as bullets with dot — for now single paragraph with bullet dot prefix handled by clean step? We render bullet via text with bullet flag if >1 sentence
    }
  });
  // No bottom callout strip — only if needed via b.callout as muted footer
  if (b.callout) text(s.items, { x: MX, y: 6.42, w: CW, h: 0.42 }, b.callout, { size: 10, italic: true, color: p.muted, align: "center", valign: "middle" });
}

function comparison(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const cols = (b.columns ?? []).slice(0, 2);
  const gap = 0.4;
  const colW = (CW - gap) / 2;
  rect(s.items, MX, BODY_Y - 0.04, CW, 0.015, p.line, { opacity: 0.55 });
  cols.forEach((c, i) => {
    const x = MX + i * (colW + gap);
    if (i > 0) rect(s.items, x - gap / 2, BODY_Y, 0.015, BODY_H, p.line, { opacity: 0.42 });
    text(s.items, { x, y: BODY_Y + 0.08, w: colW, h: 0.45 }, (c.heading ?? (i === 0 ? "Option A" : "Option B")).toUpperCase(), { font: "heading", size: 11, bold: true, color: p.text, valign: "middle", charSpacing: 0.65 });
    rect(s.items, x, BODY_Y + 0.58, colW, 0.012, p.line, { opacity: 0.48 });
    const fs = fitFont(c.bullets, colW - 0.2, BODY_H - 0.9, 15, 11, 1.32, 0.62);
    bulletList(s.items, { x, y: BODY_Y + 0.74, w: colW, h: BODY_H - 0.84 }, c.bullets, { size: fs, color: p.text });
  });
  if (b.callout) text(s.items, { x: MX, y: BODY_Y + BODY_H + 0.14, w: CW, h: 0.38 }, b.callout, { size: 10, italic: true, color: p.muted, align: "center" });
}

function table(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const t = b.table!;
  const cols = t.headers.length || t.rows[0]?.length || 1;
  const size = cols > 4 || t.rows.length > 5 ? 10.5 : 12.5;
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
    headerFill: p.bg,
    headerColor: p.text,
    headerRule: p.text,
    textColor: p.text,
    rowRule: p.line,
    fill: p.bg,
  });
  if (b.callout) text(s.items, { x: MX, y: 6.38, w: CW, h: 0.42 }, b.callout, { size: 10, italic: true, color: p.muted, valign: "middle" });
}

function quiz(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title || "Quiz", b.subtitle);
  const qs = (b.quiz ?? []).slice(0, 4);
  const letters = ["A", "B", "C", "D"];
  const gap = 0.32;
  const colW = (CW - gap) / 2;
  qs.forEach((q, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MX + col * (colW + gap);
    const y = BODY_Y + row * (BODY_H / 2 + 0.12);
    const h = BODY_H / 2 - 0.12;
    card(s.items, p, x, y, colW, h);
    const qfs = fitFont([q.question], colW - 0.6, 0.9, 12.5, 10.5, 1.2);
    text(s.items, { x: x + 0.28, y: y + 0.28, w: colW - 0.56, h: 0.9 }, `${i + 1}. ${q.question}`, { size: qfs, bold: true, color: p.text, lineSpacing: 1.2 });
    const opts = q.type === "identification" ? ["Answer: ______"] : q.options.length ? q.options.map((o, oi) => `${letters[oi] ?? oi + 1}. ${o}`) : ["True", "False"].map((o, oi) => `${letters[oi]}. ${o}`);
    const ofs = fitFont(opts, colW - 0.82, h - 1.36, 10.5, 8.5, 1.25);
    bulletList(s.items, { x: x + 0.28, y: y + 1.22, w: colW - 0.56, h: h - 1.32 }, opts, { size: ofs, color: p.muted });
  });
}

function paragraph(s: SlideScene, p: Palette, b: Block) {
  slideTitle(s.items, p, b.title, b.subtitle);
  const paras = (b.body ?? b.bullets.join("\n\n")).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  // No left strong bar — editorial like CONCEPT lead + body
  // First para is lead (bold 12.5pt), rest is 10pt
  if (paras.length === 0) return;
  const lead = paras[0];
  const rest = paras.slice(1);
  const lfs = fitFont([lead], CW, 1.1, 14, 11, 1.28);
  text(s.items, { x: MX, y: BODY_Y, w: CW, h: 1.1 }, lead, { size: lfs, bold: true, color: p.text, lineSpacing: 1.28 });
  if (rest.length) {
    const rfs = fitFont(rest, CW, BODY_H - 1.35, 12, 9.5, 1.45, 0.75);
    text(s.items, { x: MX, y: BODY_Y + 1.22, w: CW, h: BODY_H - 1.32 }, rest, { size: rfs, color: p.muted, lineSpacing: 1.45, paraGap: 0.75 });
  }
  if (b.callout) text(s.items, { x: MX, y: BODY_Y + BODY_H + 0.14, w: CW, h: 0.42 }, b.callout, { size: 10, italic: true, color: p.muted });
  maybeDecorate(s, p, paras.join(" ").length < 220);
}

function closing(s: SlideScene, p: Palette, spec: DocumentSpec, b: Block) {
  const variant = pickHeaderVariant(spec);
  if (variant === 2) {
    // Variant 2 closing mirrors variant 2 cover — mood-consistent bg, no dummy text, no date
    s.bg = p.bg;
    rect(s.items, MX, 0.55, CW, 0.015, p.line, { opacity: p.dark ? 0.28 : 0.55 });
    text(s.items, { x: MX, y: 0.28, w: CW, h: 0.22 }, (spec.docType || "Folio").toUpperCase(), { size: 7, color: p.muted, charSpacing: 1.2 });
    const title = (b.title || spec.title || "Thank You").toUpperCase();
    const fs = fitFont([title], CW * 0.92, 1.7, 52, 28, 0.98);
    const titleH = estimatedHeight([title], CW * 0.92, fs, 0.98, 0);
    const titleY = 1.9;
    text(s.items, { x: MX, y: titleY, w: CW, h: 1.7 }, title, { font: "heading", size: fs, bold: true, color: p.text, align: "center", valign: "middle", lineSpacing: 0.98, charSpacing: -0.35 });
    let anchorY = titleY + Math.min(1.7, titleH + 0.35);
    rect(s.items, MX + CW / 2 - 0.42, anchorY, 0.84, 0.02, p.text, { opacity: 0.22 });
    anchorY += 0.28;
    const sub = b.subtitle || b.callout || "";
    if (sub) {
      text(s.items, { x: MX + CW * 0.12, y: anchorY, w: CW * 0.76, h: 0.55 }, sub, { size: 12, color: p.muted, align: "center", valign: "middle", italic: true, lineSpacing: 1.2 });
      anchorY += 0.68;
    }
    const list = b.bullets.slice(0, 3);
    if (list.length) {
      const bfs = fitFont(list, CW * 0.72, 1.55, 14, 11, 1.28, 0.55);
      list.forEach((item, i) => {
        text(s.items, { x: MX + CW * 0.14, y: anchorY + i * 0.52, w: CW * 0.72, h: 0.48 }, item, { size: bfs, color: p.muted, align: "center", valign: "middle" });
      });
    }
    rect(s.items, MX, 6.92, CW, 0.015, p.line, { opacity: p.dark ? 0.28 : 0.55 });
    const footerTxt = (spec.author || spec.subtitle || "").trim().slice(0, 48);
    if (footerTxt) text(s.items, { x: MX, y: 7.02, w: CW, h: 0.22 }, footerTxt, { size: 7, color: p.muted, align: "center" });
    return;
  }
  // Light closing mirrors light cover — no date, mood-consistent, no pills
  s.bg = p.bg;
  rect(s.items, MX, 0.55, CW, 0.015, p.line, { opacity: 0.55 });
  text(s.items, { x: MX, y: 0.28, w: CW, h: 0.22 }, (spec.docType || "Folio").toUpperCase(), { size: 7, color: p.muted, charSpacing: 1.2 });
  const title2 = (b.title || spec.title || "Thank You").toUpperCase();
  const fs2 = fitFont([title2], CW * 0.92, 1.75, 50, 28, 0.98);
  const titleH2 = estimatedHeight([title2], CW * 0.92, fs2, 0.98, 0);
  const titleY2 = 1.9;
  text(s.items, { x: MX, y: titleY2, w: CW, h: 1.85 }, title2, { font: "heading", size: fs2, bold: true, color: p.text, align: "center", valign: "middle", lineSpacing: 0.98, charSpacing: -0.35 });
  let anchorY2 = titleY2 + Math.min(1.85, titleH2 + 0.35);
  rect(s.items, MX + CW / 2 - 0.42, anchorY2, 0.84, 0.02, p.text, { opacity: 0.22 });
  anchorY2 += 0.28;
  const sub2 = b.subtitle || b.callout || "";
  if (sub2) text(s.items, { x: MX + CW * 0.12, y: anchorY2, w: CW * 0.76, h: 0.52 }, sub2, { size: 12, color: p.muted, align: "center", valign: "middle", italic: true, lineSpacing: 1.2 });
  else if (b.bullets.length) {
    const bfs = fitFont(b.bullets.slice(0, 3), CW * 0.74, 1.55, 14, 11, 1.28, 0.55);
    b.bullets.slice(0, 3).forEach((item, i) => {
      text(s.items, { x: MX + CW * 0.13, y: anchorY2 + i * 0.52, w: CW * 0.74, h: 0.48 }, item, { size: bfs, color: p.muted, align: "center", valign: "middle", lineSpacing: 1.28 });
    });
  } else if (b.body) {
    text(s.items, { x: MX + CW * 0.12, y: anchorY2, w: CW * 0.76, h: 1.2 }, b.body.slice(0, 140), { size: 11, color: p.muted, align: "center", lineSpacing: 1.35 });
  }
  rect(s.items, MX, 6.92, CW, 0.015, p.line, { opacity: 0.55 });
  const footerTxt2 = (spec.author || spec.subtitle || "").trim().slice(0, 48);
  if (footerTxt2) text(s.items, { x: MX, y: 7.02, w: CW, h: 0.22 }, footerTxt2, { size: 7, color: p.muted, align: "center" });
}

/* ------------------------------------------------------------------ */
/*  Entry                                                               */
/* ------------------------------------------------------------------ */

export function buildDeck(spec: DocumentSpec): DeckScene {
  const resolved = resolveDesign({ docType: spec.docType, tone: spec.tone, audience: spec.audience, preferredTheme: spec.theme as any, format: "pptx" });
  let themeId = spec.theme as string;
  if (themeId === "mono" && resolved.themeId !== "mono") themeId = resolved.themeId;
  const t = getTheme(themeId);
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
