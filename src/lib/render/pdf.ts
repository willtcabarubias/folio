import PDFDocument from "pdfkit";
import { getTheme, type Theme } from "@/lib/spec/themes";
import type { Block, DocumentSpec } from "@/lib/spec/types";
import { pdfText } from "./pdf-text";

export { pdfText, pdfSupportRatio } from "./pdf-text";

type Colors = Theme["colors"];
type Fonts = Theme["pdfFonts"];

/* ------------------------------------------------------------------ */
/*  Layout engine                                                       */
/* ------------------------------------------------------------------ */

class Layout {
  doc: PDFKit.PDFDocument;
  c: Colors;
  f: Fonts;
  k: number;
  compact: boolean;
  card: string;
  W: number;
  H: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  cw: number;

  constructor(doc: PDFKit.PDFDocument, c: Colors, f: Fonts, k: number, compact: boolean) {
    this.doc = doc;
    this.c = c;
    this.f = f;
    this.k = k;
    this.compact = compact;
    this.card = c.surface.toUpperCase() === "FFFFFF" ? c.bg : c.surface;
    this.W = doc.page.width;
    this.H = doc.page.height;
    this.left = doc.page.margins.left;
    this.right = this.W - doc.page.margins.right;
    this.top = doc.page.margins.top;
    this.bottom = this.H - doc.page.margins.bottom;
    this.cw = this.right - this.left;
  }

  /** Scale a size by the fit density. */
  S(n: number) {
    return n * this.k;
  }
  hex(h: string) {
    return `#${h}`;
  }
  get y() {
    return this.doc.y;
  }
  set y(v: number) {
    this.doc.y = v;
  }
  pageIndex(): number {
    const r = this.doc.bufferedPageRange();
    return r.start + r.count - 1;
  }
  remaining(): number {
    return this.bottom - this.doc.y;
  }
  ensure(h: number) {
    if (this.doc.y + h > this.bottom) {
      this.doc.addPage();
      this.doc.y = this.top;
    }
  }
  measure(text: string, width: number, font: string, size: number, lineGap = 2): number {
    this.doc.font(font).fontSize(size);
    return this.doc.heightOfString(text || " ", { width, lineGap });
  }
  write(text: string, x: number, y: number, width: number, o: { font?: string; size?: number; color?: string; align?: "left" | "center" | "right" | "justify"; lineGap?: number; opacity?: number; spacing?: number }) {
    this.doc.save();
    this.doc.font(o.font ?? this.f.body).fontSize(o.size ?? this.S(10.5)).fillColor(this.hex(o.color ?? this.c.text));
    if (o.opacity !== undefined) this.doc.fillOpacity(o.opacity);
    this.doc.text(text, x, y, { width, align: o.align ?? "left", lineGap: o.lineGap ?? 2, characterSpacing: o.spacing });
    const endY = this.doc.y;
    this.doc.restore();
    this.doc.y = endY;
    return endY;
  }
  rect(x: number, y: number, w: number, h: number, color: string, r = 0, opacity = 1) {
    this.doc.save().fillOpacity(opacity);
    if (r) this.doc.roundedRect(x, y, w, h, r).fill(this.hex(color));
    else this.doc.rect(x, y, w, h).fill(this.hex(color));
    this.doc.restore();
  }
  circle(cx: number, cy: number, r: number, color: string, opacity = 1) {
    this.doc.save().fillOpacity(opacity).circle(cx, cy, r).fill(this.hex(color)).restore();
  }
  hr(y: number, color: string, x1 = this.left, x2 = this.right, width = 0.6) {
    this.doc.save().lineWidth(width).strokeColor(this.hex(color)).moveTo(x1, y).lineTo(x2, y).stroke().restore();
  }
}

/* ------------------------------------------------------------------ */
/*  Building blocks                                                     */
/* ------------------------------------------------------------------ */

function heading(L: Layout, text: string, size = 18) {
  if (L.compact) {
    L.ensure(L.S(40));
    L.y += L.S(7);
    L.write(text.toUpperCase(), L.left, L.y, L.cw, { font: L.f.bold, size: L.S(9.5), color: L.c.primary, spacing: 1.3, lineGap: 0 });
    L.y += L.S(3.5);
    L.hr(L.y, L.c.line, L.left, L.right, 0.7);
    L.y += L.S(7);
    return;
  }
  L.ensure(size * 3.2 * L.k);
  L.y += L.S(10);
  L.write(text, L.left, L.y, L.cw, { font: L.f.heading, size: L.S(size), color: L.c.primary, lineGap: 1 });
  L.y += L.S(4);
  L.rect(L.left, L.y, 34, 2.2, L.c.primary, 1);
  L.y += L.S(14);
}

function paragraphs(L: Layout, body: string, o: { size?: number; color?: string } = {}) {
  const paras = body
    .split(/\n{2,}/)
    .map((s) => s.replace(/\n/g, " ").trim())
    .filter(Boolean);
  for (const p of paras) {
    L.ensure(L.S(30));
    L.write(pdfText(p), L.left, L.y, L.cw, { size: o.size ?? L.S(L.compact ? 10 : 10.5), color: o.color ?? L.c.text, lineGap: L.S(L.compact ? 2.4 : 3.2) });
    L.y += L.S(L.compact ? 5 : 8);
  }
}

function bullets(L: Layout, items: string[], x = L.left, width = L.cw, size?: number) {
  const fs = size ?? L.S(L.compact ? 10 : 10.5);
  for (const item of items) {
    const text = pdfText(item);
    const h = L.measure(text, width - 16, L.f.body, fs, L.S(2.4));
    L.ensure(Math.min(h, 60) + 4);
    const y = L.y;
    L.circle(x + 4, y + fs * 0.55, fs * 0.19, L.c.primary);
    L.write(text, x + 16, y, width - 16, { size: fs, lineGap: L.S(2.4) });
    L.y += L.S(L.compact ? 2.5 : 4.5);
  }
  L.y += L.S(4);
}

function calloutBox(L: Layout, text: string, label = "Key takeaway") {
  const t = pdfText(text);
  const padX = L.S(18);
  const w = L.cw;
  const th = L.measure(t, w - padX * 2 - 6, L.f.bold, L.S(11), 3);
  const h = th + L.S(L.compact ? 30 : 46);
  L.ensure(h + 10);
  const y = L.y;
  L.rect(L.left, y, w, h, L.c.accent, 6);
  L.rect(L.left, y, 3.5, h, L.c.primary, 1.5);
  if (!L.compact) L.write(label.toUpperCase(), L.left + padX, y + L.S(13), w - padX * 2, { size: L.S(7.5), color: L.c.muted, font: L.f.bold, spacing: 1.2 });
  L.write(t, L.left + padX, y + L.S(L.compact ? 12 : 27), w - padX * 2 - 6, { size: L.S(11), color: L.c.primary, font: L.f.bold, lineGap: 3 });
  L.y = y + h + L.S(14);
}

function statsRow(L: Layout, stats: NonNullable<Block["stats"]>) {
  const n = stats.length;
  const gap = 10;
  const cw = (L.cw - gap * (n - 1)) / n;
  const pad = L.S(14);
  const valueSize = (v: string) => L.S(v.length > 14 ? 14 : v.length > 9 ? 17 : 22);
  const heights = stats.map((s) => {
    const vh = L.measure(pdfText(s.value), cw - pad * 2, L.f.heading, valueSize(s.value), 0);
    const lh = L.measure(pdfText(s.label), cw - pad * 2, L.f.bold, L.S(9.5), 1);
    const dh = s.description ? L.measure(pdfText(s.description), cw - pad * 2, L.f.body, L.S(8.5), 1) + 4 : 0;
    return vh + lh + dh + pad * 2 + 6;
  });
  const h = Math.max(...heights);
  L.ensure(h + 12);
  const y = L.y;
  stats.forEach((s, i) => {
    const x = L.left + i * (cw + gap);
    L.rect(x, y, cw, h, L.card, 6);
    L.rect(x, y + 12, 3, 22, L.c.primary, 1.5);
    let yy = y + pad;
    yy = L.write(pdfText(s.value), x + pad, yy, cw - pad * 2, { font: L.f.heading, size: valueSize(s.value), color: L.c.primary, lineGap: 0 }) + 4;
    yy = L.write(pdfText(s.label), x + pad, yy, cw - pad * 2, { font: L.f.bold, size: L.S(9.5), lineGap: 1 }) + 3;
    if (s.description) L.write(pdfText(s.description), x + pad, yy, cw - pad * 2, { size: L.S(8.5), color: L.c.muted, lineGap: 1 });
  });
  L.y = y + h + L.S(14);
}

function quoteBox(L: Layout, q: NonNullable<Block["quote"]>) {
  const text = pdfText(`\u201C${q.text}\u201D`);
  const pad = L.S(20);
  const th = L.measure(text, L.cw - pad * 2 - 6, L.f.italic, L.S(12.5), 3.5);
  const ah = q.attribution ? L.S(16) : 0;
  const h = th + ah + pad * 2;
  L.ensure(h + 10);
  const y = L.y;
  L.rect(L.left, y, L.cw, h, L.card, 6);
  L.rect(L.left, y, 3.5, h, L.c.primary, 1.5);
  const end = L.write(text, L.left + pad, y + pad, L.cw - pad * 2 - 6, { font: L.f.italic, size: L.S(12.5), lineGap: 3.5 });
  if (q.attribution) L.write(pdfText(`— ${q.attribution}`), L.left + pad, end + 4, L.cw - pad * 2, { size: L.S(9), color: L.c.muted });
  L.y = y + h + L.S(14);
}

function timeline(L: Layout, steps: NonNullable<Block["steps"]>) {
  const x = L.left + 11;
  const tx = L.left + 34;
  const tw = L.cw - 34;
  steps.forEach((s, i) => {
    const label = pdfText(s.label);
    const desc = pdfText(s.description ?? "");
    const lh = L.measure(label, tw, L.f.bold, L.S(10.5), 1);
    const dh = desc ? L.measure(desc, tw, L.f.body, L.S(9.5), 2) : 0;
    const h = Math.max(L.S(24), lh + dh + L.S(6));
    L.ensure(h + 6);
    const y = L.y;
    if (i < steps.length - 1) L.doc.save().lineWidth(1.2).strokeColor(L.hex(L.c.line)).moveTo(x, y + 18).lineTo(x, y + h + 6).stroke().restore();
    L.circle(x, y + 8, 8.5, L.c.primary);
    L.write(String(i + 1), x - 8.5, y + 3.6, 17, { font: L.f.bold, size: 8, color: L.c.onPrimary, align: "center", lineGap: 0 });
    const end = L.write(label, tx, y + 1, tw, { font: L.f.bold, size: L.S(10.5), lineGap: 1 });
    if (desc) L.write(desc, tx, end + 2, tw, { size: L.S(9.5), color: L.c.muted, lineGap: 2 });
    L.y = y + h + L.S(6);
  });
  L.y += L.S(6);
}

function groupsBlock(L: Layout, gs: NonNullable<Block["groups"]>) {
  for (const g of gs) {
    const meta = pdfText(g.meta ?? "");
    const metaW = meta ? Math.min(L.cw * 0.36, 180) : 0;
    const heading = pdfText(g.heading);
    const hw = L.cw - metaW - (meta ? 10 : 0);
    const hh = L.measure(heading, hw, L.f.bold, L.S(10.5), 1);
    L.ensure(hh + L.S(28));
    const y = L.y;
    L.write(heading, L.left, y, hw, { font: L.f.bold, size: L.S(10.5), lineGap: 1 });
    const endY = L.y;
    if (meta) L.write(meta, L.right - metaW, y + L.S(1.2), metaW, { size: L.S(9), color: L.c.muted, align: "right", lineGap: 1 });
    L.y = Math.max(endY, L.y) + L.S(2.5);
    if (g.body) {
      L.write(pdfText(g.body.replace(/\n+/g, " ")), L.left, L.y, L.cw, { size: L.S(9.6), color: L.c.muted, lineGap: 2 });
      L.y += L.S(3);
    }
    if (g.bullets.length) bullets(L, g.bullets, L.left, L.cw, L.S(L.compact ? 9.8 : 10.2));
    L.y += L.S(L.compact ? 2 : 4);
  }
}

function columns(L: Layout, cols: NonNullable<Block["columns"]>, comparison: boolean) {
  const n = Math.min(cols.length, 3);
  const gap = 12;
  const cw = (L.cw - gap * (n - 1)) / n;
  const pad = L.S(12);
  const headH = L.S(28);
  const bodySize = L.S(9.8);
  const measureCol = (c: (typeof cols)[number]) => {
    let h = pad;
    if (c.heading && !comparison) h += L.measure(pdfText(c.heading), cw - pad * 2, L.f.bold, L.S(11), 1) + 8;
    if (c.body) h += L.measure(pdfText(c.body), cw - pad * 2, L.f.body, bodySize, 2.4) + 8;
    for (const b of c.bullets) h += L.measure(pdfText(b), cw - pad * 2 - 14, L.f.body, bodySize, 2.2) + 4.5;
    return h + pad;
  };
  const heights = cols.slice(0, n).map(measureCol);
  const bodyH = Math.max(...heights);
  const total = bodyH + (comparison ? headH : 0);
  const pageH = L.bottom - L.top;

  if (total > pageH - 40) {
    cols.slice(0, n).forEach((c) => {
      if (c.heading) {
        L.ensure(30);
        L.write(pdfText(c.heading), L.left, L.y, L.cw, { font: L.f.bold, size: L.S(11.5), color: L.c.primary });
        L.y += 6;
      }
      if (c.body) paragraphs(L, c.body, { size: L.S(10) });
      bullets(L, c.bullets, L.left, L.cw, L.S(10));
    });
    return;
  }

  L.ensure(total + 10);
  const y0 = L.y;
  cols.slice(0, n).forEach((c, i) => {
    const x = L.left + i * (cw + gap);
    let y = y0;
    if (comparison) {
      L.rect(x, y, cw, headH, i === 0 ? L.c.primary : L.c.secondary, 6);
      L.rect(x, y + headH - 6, cw, 6, i === 0 ? L.c.primary : L.c.secondary);
      L.write(pdfText(c.heading ?? (i === 0 ? "Option A" : "Option B")), x + pad, y + L.S(8), cw - pad * 2, { font: L.f.bold, size: L.S(10.5), color: L.c.onPrimary, lineGap: 0 });
      y += headH;
      L.rect(x, y, cw, bodyH, L.card);
    } else {
      L.rect(x, y, cw, bodyH, L.card, 6);
      L.rect(x, y, cw, 3, L.c.primary, 1);
    }
    let yy = y + pad;
    if (c.heading && !comparison) yy = L.write(pdfText(c.heading), x + pad, yy, cw - pad * 2, { font: L.f.bold, size: L.S(11), color: L.c.primary, lineGap: 1 }) + 8;
    if (c.body) yy = L.write(pdfText(c.body), x + pad, yy, cw - pad * 2, { size: bodySize, lineGap: 2.4 }) + 8;
    for (const b of c.bullets) {
      L.circle(x + pad + 3, yy + 5.5, 1.9, L.c.primary);
      yy = L.write(pdfText(b), x + pad + 14, yy, cw - pad * 2 - 14, { size: bodySize, lineGap: 2.2 }) + 4.5;
    }
  });
  L.y = y0 + total + L.S(14);
}

function quizBlock(L: Layout, qs: NonNullable<Block["quiz"]>) {
  const letters = ["A", "B", "C", "D", "E", "F"];
  qs.forEach((q, idx) => {
    const type = q.type ?? (q.options.length <= 2 ? "tf" : "mcq");
    const num = idx + 1;
    const qText = pdfText(`${num}. ${q.question}`);
    const h = L.measure(qText, L.cw, L.f.bold, L.S(10.5), 2.4);
    L.ensure(Math.min(h + 28, 80));
    L.write(qText, L.left, L.y, L.cw, { font: L.f.bold, size: L.S(10.5), lineGap: L.S(2.4) });
    L.y += L.S(3);
    if (type === "identification") {
      L.write("Answer: _________________________", L.left + L.S(12), L.y, L.cw - L.S(12), { size: L.S(9.5), color: L.c.muted, lineGap: 2 });
      L.y += L.S(7);
      if (q.explanation) {
        L.write(pdfText(q.explanation), L.left + L.S(12), L.y, L.cw - L.S(12), { size: L.S(8.8), color: L.c.muted, lineGap: 1.8 });
        L.y += L.S(4);
      }
    } else {
      const opts = q.options.length ? q.options : ["True", "False"];
      opts.forEach((opt, oi) => {
        const label = letters[oi] ?? String(oi + 1);
        const line = pdfText(`${label}. ${opt}`);
        const lh = L.measure(line, L.cw - L.S(24), L.f.body, L.S(10), 2);
        L.ensure(Math.min(lh + 10, 50));
        const y = L.y;
        L.circle(L.left + L.S(6), y + L.S(6), L.S(3.2), L.c.line);
        L.write(line, L.left + L.S(16), y, L.cw - L.S(16), { size: L.S(10), lineGap: 2 });
        L.y += L.S(2);
      });
      L.y += L.S(3);
      if (q.answer || typeof q.answerIndex === "number") {
        const ans = q.answer ?? (typeof q.answerIndex === "number" && q.options[q.answerIndex] ? q.options[q.answerIndex] : "");
        if (ans) {
          L.write(pdfText(`Answer: ${ans}`), L.left + L.S(12), L.y, L.cw - L.S(12), { size: L.S(8.8), color: L.c.primary, font: L.f.bold, lineGap: 1.5 });
          L.y += L.S(4);
        }
      }
    }
    L.y += L.S(4);
  });
  L.y += L.S(6);
}

function table(L: Layout, t: NonNullable<Block["table"]>) {
  const cols = Math.max(t.headers.length, ...t.rows.map((r) => r.length), 1);
  const cw = L.cw / cols;
  const pad = L.S(7);
  const size = L.S(cols > 4 ? 8.5 : 9.5);
  const drawHeader = () => {
    if (!t.headers.some(Boolean)) return;
    const hh = Math.max(...t.headers.map((h) => L.measure(pdfText(h), cw - pad * 2, L.f.bold, size, 1))) + pad * 2;
    L.rect(L.left, L.y, L.cw, hh, L.card);
    t.headers.forEach((h, i) => L.write(pdfText(h), L.left + i * cw + pad, L.y + pad, cw - pad * 2, { font: L.f.bold, size, color: L.c.text, lineGap: 1 }));
    L.hr(L.y + hh, L.c.primary, L.left, L.right, 1.3);
    L.y += hh;
  };
  L.ensure(60);
  drawHeader();
  t.rows.forEach((r) => {
    const rh = Math.max(...r.map((c) => L.measure(pdfText(c), cw - pad * 2, L.f.body, size, 1.5))) + pad * 2;
    if (L.y + rh > L.bottom) {
      L.doc.addPage();
      L.y = L.top;
      drawHeader();
    }
    const y = L.y;
    r.forEach((c, i) => L.write(pdfText(c), L.left + i * cw + pad, y + pad, cw - pad * 2, { size, lineGap: 1.5 }));
    L.hr(y + rh, L.c.line);
    L.y = y + rh;
  });
  L.y += L.S(14);
}

/* ------------------------------------------------------------------ */
/*  Pages                                                               */
/* ------------------------------------------------------------------ */

function coverPage(L: Layout, spec: DocumentSpec, b: Block | undefined) {
  const bandH = L.H * 0.58;
  L.rect(0, 0, L.W, bandH, L.c.primary);
  L.circle(L.W * 0.86, bandH * 0.25, 150, L.c.secondary, 0.35);
  L.circle(L.W * 0.7, bandH * 0.95, 90, L.c.accent, 0.18);
  const x = L.left;
  L.rect(x, bandH * 0.36, 28, 2.5, L.c.accent, 1);
  L.write(pdfText(spec.docType).toUpperCase(), x + 38, bandH * 0.36 - 5, 300, { size: 8.5, color: L.c.onPrimary, opacity: 0.8, spacing: 2, font: L.f.bold });
  const title = pdfText(b?.title || spec.title);
  const size = title.length > 70 ? 26 : title.length > 40 ? 30 : 36;
  const end = L.write(title, x, bandH * 0.42, L.cw - 40, { font: L.f.heading, size, color: L.c.onPrimary, lineGap: 2 });
  const subtitle = pdfText(b?.subtitle || spec.subtitle || "");
  if (subtitle) L.write(subtitle, x, end + 14, L.cw - 60, { size: 13, color: L.c.onPrimary, opacity: 0.85, lineGap: 3 });

  L.y = bandH + 40;
  if (b?.body) {
    L.write("ABSTRACT", x, L.y, 200, { size: 7.5, color: L.c.muted, font: L.f.bold, spacing: 1.5 });
    L.y += 16;
    const abstract = pdfText(b.body.replace(/\n+/g, " "));
    const maxH = L.bottom - 50 - L.y;
    const h = L.measure(abstract, L.cw, L.f.body, 10.5, 3.2);
    if (h <= maxH) L.write(abstract, x, L.y, L.cw, { size: 10.5, lineGap: 3.2, color: L.c.text });
    else {
      L.doc.save().rect(x, L.y, L.cw, maxH).clip();
      L.write(abstract, x, L.y, L.cw, { size: 10.5, lineGap: 3.2, color: L.c.text });
      L.doc.restore();
    }
  }
  const meta = [spec.author, spec.date].filter(Boolean).map(pdfText).join("   ·   ");
  L.hr(L.bottom - 28, L.c.line);
  L.write(meta || pdfText(spec.title), x, L.bottom - 18, L.cw, { size: 9, color: L.c.muted, lineGap: 0 });
  L.doc.addPage();
  L.y = L.top;
}

function compactHeader(L: Layout, spec: DocumentSpec, b: Block | undefined) {
  const title = pdfText(b?.title || spec.title);
  const size = L.S(title.length > 40 ? 20 : 24);
  L.write(title, L.left, L.top, L.cw, { font: L.f.heading, size, color: L.c.primary, lineGap: 0 });
  L.y += L.S(3);
  const subtitle = pdfText(b?.subtitle || spec.subtitle || "");
  if (subtitle) {
    L.write(subtitle, L.left, L.y, L.cw, { size: L.S(11.5), color: L.c.secondary, lineGap: 1 });
    L.y += L.S(2);
  }
  const meta = (b?.bullets ?? []).map((x) => pdfText(x)).filter(Boolean);
  if (meta.length) {
    L.write(meta.join("   ·   "), L.left, L.y, L.cw, { size: L.S(9.2), color: L.c.muted, lineGap: 1 });
    L.y += L.S(2);
  }
  if (b?.body) {
    L.y += L.S(3);
    L.write(pdfText(b.body.replace(/\n+/g, " ")), L.left, L.y, L.cw, { size: L.S(10), lineGap: L.S(2.4) });
  }
  L.y += L.S(6);
  L.hr(L.y, L.c.primary, L.left, L.right, 1);
  L.y += L.S(4);
}

type TocEntry = { title: string; y: number; page: number };

function contentsPage(L: Layout, titles: string[]): TocEntry[] {
  heading(L, "Contents", 20);
  const entries: TocEntry[] = [];
  const page = L.pageIndex();
  titles.forEach((t, i) => {
    const text = pdfText(t);
    const h = L.measure(text, L.cw - 90, L.f.body, 10.5, 2) + 12;
    L.ensure(h);
    const y = L.y;
    L.write(String(i + 1).padStart(2, "0"), L.left, y + 3, 26, { font: L.f.bold, size: 9.5, color: L.c.primary });
    L.write(text, L.left + 30, y + 3, L.cw - 90, { size: 10.5, lineGap: 2 });
    L.hr(y + h - 1, L.c.line);
    entries.push({ title: t, y: y + 3, page });
    L.y = y + h;
  });
  L.doc.addPage();
  L.y = L.top;
  return entries;
}

function renderBlock(L: Layout, b: Block) {
  heading(L, pdfText(b.title));
  if (b.subtitle) {
    L.write(pdfText(b.subtitle), L.left, L.y, L.cw, { font: L.f.italic, size: L.S(10.5), color: L.c.muted, lineGap: 2 });
    L.y += L.S(8);
  }
  if (b.body) paragraphs(L, b.body);

  switch (b.layout) {
    case "bullets":
    case "agenda":
      bullets(L, b.bullets);
      break;
    case "two-column":
      columns(L, b.columns ?? [], false);
      break;
    case "comparison":
      columns(L, b.columns ?? [], true);
      break;
    case "groups":
      groupsBlock(L, b.groups ?? []);
      if (b.bullets.length) bullets(L, b.bullets);
      break;
    case "stats":
      statsRow(L, b.stats ?? []);
      if (b.bullets.length) bullets(L, b.bullets);
      break;
    case "quote":
      if (b.quote) quoteBox(L, b.quote);
      if (b.bullets.length) bullets(L, b.bullets);
      break;
    case "timeline":
      timeline(L, b.steps ?? []);
      if (b.bullets.length) bullets(L, b.bullets);
      break;
    case "table":
      if (b.table) table(L, b.table);
      if (b.bullets.length) bullets(L, b.bullets);
      break;
    case "quiz":
      if (b.quiz?.length) quizBlock(L, b.quiz);
      if (b.bullets.length) bullets(L, b.bullets);
      break;
    default:
      if (b.bullets.length) bullets(L, b.bullets);
      if (b.quiz?.length) quizBlock(L, b.quiz);
  }
  if (b.callout) calloutBox(L, b.callout, b.layout === "closing" ? "Recommendation" : "Key takeaway");
}

function footers(L: Layout, spec: DocumentSpec, skipFirst: boolean) {
  const range = L.doc.bufferedPageRange();
  const total = range.count;
  if (total <= 1) return;
  for (let i = range.start; i < range.start + range.count; i++) {
    if (i === 0 && skipFirst) continue;
    L.doc.switchToPage(i);
    const saved = L.doc.page.margins.bottom;
    L.doc.page.margins.bottom = 0;
    const y = L.H - 40;
    L.hr(y - 8, L.c.line);
    L.doc.save().font(L.f.body).fontSize(7.5).fillColor(L.hex(L.c.muted));
    L.doc.text(pdfText(spec.title), L.left, y, { width: L.cw - 80, lineBreak: false });
    L.doc.text(`Page ${i + 1} of ${total}`, L.left, y, { width: L.cw, align: "right", lineBreak: false });
    L.doc.restore();
    L.doc.page.margins.bottom = saved;
  }
}

/* ------------------------------------------------------------------ */
/*  Entry                                                               */
/* ------------------------------------------------------------------ */

export function lightColors(t: Theme): Colors {
  // Documents always stay light; dark themes contribute their accent colors only.
  return t.dark
    ? { ...t.colors, bg: "FFFFFF", surface: "F3F5FB", text: "141B2D", muted: "6B7590", primary: "1B2559", accent: "DCE4FF", line: "E1E6F2" }
    : t.colors;
}

export async function renderPdfMeasured(spec: DocumentSpec): Promise<{ buffer: Buffer; pages: number }> {
  const t = getTheme(spec.theme);
  const c = lightColors(t);
  const k = Math.min(1, Math.max(0.6, spec.density ?? 1));
  const compact = Boolean(spec.compact);
  const margin = Math.round((compact ? 50 : 56) * (0.86 + 0.14 * k));

  const doc = new PDFDocument({
    size: spec.pageSize === "Letter" ? "LETTER" : "A4",
    margins: { top: compact ? margin : 64, bottom: compact ? margin : 70, left: margin, right: margin },
    bufferPages: true,
    info: { Title: spec.title, Author: spec.author ?? "Folio", Subject: spec.subtitle ?? spec.docType, Creator: "Folio" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const L = new Layout(doc, c, t.pdfFonts, k, compact);
  const coverBlock = spec.blocks.find((b) => b.layout === "cover");
  const content = spec.blocks.filter((b) => b.layout !== "cover" && b.layout !== "agenda" && b.layout !== "section");

  let toc: TocEntry[] = [];
  if (compact) compactHeader(L, spec, coverBlock);
  else {
    coverPage(L, spec, coverBlock);
    if ((spec.targetPages ?? 0) >= 6 && content.length >= 5) toc = contentsPage(L, content.map((b) => b.title));
  }

  const startPages: number[] = [];
  content.forEach((b) => {
    if (L.remaining() < L.S(compact ? 70 : 110)) {
      doc.addPage();
      L.y = L.top;
    }
    startPages.push(L.pageIndex() + 1);
    renderBlock(L, b);
  });

  if (toc.length) {
    doc.switchToPage(toc[0].page);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    toc.forEach((e, i) => {
      doc.save().font(L.f.bold).fontSize(9.5).fillColor(L.hex(c.muted));
      doc.text(String(startPages[i] ?? ""), L.right - 40, e.y, { width: 40, align: "right", lineBreak: false });
      doc.restore();
    });
    doc.page.margins.bottom = saved;
  }

  footers(L, spec, !compact);
  const pages = doc.bufferedPageRange().count;
  doc.end();
  const buffer = await done;
  return { buffer, pages };
}

export async function renderPdf(spec: DocumentSpec): Promise<Buffer> {
  return (await renderPdfMeasured(spec)).buffer;
}
