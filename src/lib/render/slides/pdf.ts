import PDFDocument from "pdfkit";
import type { DocumentSpec } from "@/lib/spec/types";
import { pdfText } from "../pdf-text";
import { buildDeck, SLIDE_H, SLIDE_W, type FontRole, type TablePrim, type TextPrim } from "./scene";

const PT = 72;
const PAGE: [number, number] = [SLIDE_W * PT, SLIDE_H * PT];

function fontFor(role: FontRole, bold: boolean, italic: boolean): string {
  if (role === "serif") return bold && italic ? "Times-BoldItalic" : bold ? "Times-Bold" : italic ? "Times-Italic" : "Times-Roman";
  if (role === "heading") return italic ? "Helvetica-BoldOblique" : "Helvetica-Bold";
  return bold && italic ? "Helvetica-BoldOblique" : bold ? "Helvetica-Bold" : italic ? "Helvetica-Oblique" : "Helvetica";
}

const hex = (c: string) => `#${c}`;

function drawText(doc: PDFKit.PDFDocument, t: TextPrim) {
  const x = t.x * PT;
  const y = t.y * PT;
  const w = t.w * PT;
  const h = t.h * PT;
  const paragraphs = t.paragraphs.map((p) => pdfText(p) || " ");
  const indent = t.bullets ? 16 : 0;
  const font = fontFor(t.font, t.bold, t.italic);
  let size = t.size;

  const measure = (fs: number) => {
    doc.font(font).fontSize(fs);
    const lineH = doc.currentLineHeight(false);
    const lineGap = Math.max(0, fs * t.lineSpacing - lineH);
    const heights = paragraphs.map((p) => doc.heightOfString(p, { width: w - indent, lineGap, characterSpacing: t.charSpacing }));
    const total = heights.reduce((a, b) => a + b, 0) + Math.max(0, paragraphs.length - 1) * fs * t.paraGap;
    return { heights, total, lineGap, lineH };
  };

  // Helvetica is wider than Calibri: shrink until the text fits its box (preview-only safety).
  let m = measure(size);
  while (m.total > h + 1 && size > 8) {
    size -= 1;
    m = measure(size);
  }

  let cursor = y;
  if (t.valign === "middle") cursor = y + Math.max(0, (h - m.total) / 2);
  else if (t.valign === "bottom") cursor = y + Math.max(0, h - m.total);

  doc.save();
  doc.font(font).fontSize(size).fillColor(hex(t.color)).fillOpacity(t.opacity);
  paragraphs.forEach((p, i) => {
    if (t.bullets) {
      const s = size * 0.28;
      doc.roundedRect(x + 2, cursor + m.lineH * 0.42, s, s, s * 0.32).fill(hex(t.color));
    }
    doc.text(p, x + indent, cursor, { width: w - indent, align: t.align, lineGap: m.lineGap, characterSpacing: t.charSpacing, lineBreak: true });
    cursor += m.heights[i] + size * t.paraGap;
  });
  doc.restore();
}

function drawTable(doc: PDFKit.PDFDocument, t: TablePrim) {
  const x0 = t.x * PT;
  let y = t.y * PT;
  const colW = t.colW.map((c) => c * PT);
  const pad = 6;
  const bottomLimit = SLIDE_H * PT - 0.8 * PT;
  const bodyFont = fontFor(t.font, false, false);
  const headFont = fontFor(t.font, true, false);
  let size = t.size;

  const rowHeight = (cells: string[], font: string) => {
    doc.font(font).fontSize(size);
    return Math.max(...cells.map((c, i) => doc.heightOfString(pdfText(c) || " ", { width: colW[i] - pad * 2, lineGap: 1 }))) + pad * 2;
  };
  const totalHeight = () => (t.headers.length ? rowHeight(t.headers, headFont) : 0) + t.rows.reduce((a, r) => a + rowHeight(r, bodyFont), 0);
  while (y + totalHeight() > bottomLimit && size > 8) size -= 1;

  if (t.headers.length) {
    const hh = rowHeight(t.headers, headFont);
    doc.save().rect(x0, y, t.w * PT, hh).fill(hex(t.headerFill)).restore();
    doc.save().font(headFont).fontSize(size).fillColor(hex(t.headerColor));
    let cx = x0;
    t.headers.forEach((c, i) => {
      doc.text(pdfText(c), cx + pad, y + pad, { width: colW[i] - pad * 2, lineGap: 1 });
      cx += colW[i];
    });
    doc.restore();
    doc.save().lineWidth(1.5).strokeColor(hex(t.headerRule)).moveTo(x0, y + hh).lineTo(x0 + t.w * PT, y + hh).stroke().restore();
    y += hh;
  }
  for (const r of t.rows) {
    const rh = rowHeight(r, bodyFont);
    doc.save().font(bodyFont).fontSize(size).fillColor(hex(t.textColor));
    let cx = x0;
    r.forEach((c, i) => {
      doc.text(pdfText(c), cx + pad, y + pad, { width: colW[i] - pad * 2, lineGap: 1 });
      cx += colW[i];
    });
    doc.restore();
    doc.save().lineWidth(0.5).strokeColor(hex(t.rowRule)).moveTo(x0, y + rh).lineTo(x0 + t.w * PT, y + rh).stroke().restore();
    y += rh;
  }
}

/** PDF twin of the deck: same scene, same geometry — used for previews and image export. */
export async function renderSlidesPdf(spec: DocumentSpec): Promise<Buffer> {
  const deck = buildDeck(spec);
  const doc = new PDFDocument({ size: PAGE, margin: 0, autoFirstPage: false, info: { Title: spec.title, Author: spec.author ?? "Folio", Creator: "Folio" } });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  for (const s of deck.slides) {
    doc.addPage({ size: PAGE, margin: 0 });
    doc.save().rect(0, 0, PAGE[0], PAGE[1]).fill(hex(s.bg)).restore();
    for (const it of s.items) {
      switch (it.kind) {
        case "rect": {
          doc.save().fillOpacity(it.opacity);
          const [x, y, w, h] = [it.x * PT, it.y * PT, it.w * PT, it.h * PT];
          if (it.radius) doc.roundedRect(x, y, w, h, it.radius * PT);
          else doc.rect(x, y, w, h);
          if (it.stroke) doc.lineWidth(it.stroke.width).fillAndStroke(hex(it.color), hex(it.stroke.color));
          else doc.fill(hex(it.color));
          doc.restore();
          break;
        }
        case "circle":
          doc
            .save()
            .fillOpacity(it.opacity)
            .circle((it.x + it.d / 2) * PT, (it.y + it.d / 2) * PT, (it.d / 2) * PT)
            .fill(hex(it.color))
            .restore();
          break;
        case "text":
          drawText(doc, it);
          break;
        case "table":
          drawTable(doc, it);
          break;
      }
    }
  }
  doc.end();
  return done;
}
