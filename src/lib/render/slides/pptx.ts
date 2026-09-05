import PptxGenJS from "pptxgenjs";
import type { DocumentSpec } from "@/lib/spec/types";
import { buildDeck, type DeckScene, type FontRole, type TablePrim, type TextPrim } from "./scene";

function fontName(deck: DeckScene, role: FontRole): string {
  if (role === "heading") return deck.fonts.heading;
  if (role === "serif") return "Georgia";
  return deck.fonts.body;
}

function transparency(opacity: number): number {
  return Math.round((1 - Math.min(1, Math.max(0, opacity))) * 100);
}

function addText(slide: PptxGenJS.Slide, deck: DeckScene, t: TextPrim) {
  const box: PptxGenJS.TextPropsOptions = { x: t.x, y: t.y, w: t.w, h: t.h, margin: 0, align: t.align, valign: t.valign };
  const font: PptxGenJS.TextPropsOptions = {
    fontFace: fontName(deck, t.font),
    fontSize: t.size,
    bold: t.bold,
    italic: t.italic,
    color: t.color,
    transparency: t.opacity < 1 ? transparency(t.opacity) : undefined,
    charSpacing: t.charSpacing,
    lineSpacingMultiple: t.lineSpacing,
  };
  if (t.paragraphs.length === 1 && !t.bullets) {
    slide.addText(t.paragraphs[0] || " ", { ...box, ...font });
    return;
  }
  const runs: PptxGenJS.TextProps[] = t.paragraphs.map((p, i) => ({
    text: p,
    options: {
      ...font,
      bullet: t.bullets ? ({ indent: 18, type: "square" } as any) : undefined,
      breakLine: !t.bullets && i < t.paragraphs.length - 1,
      paraSpaceAfter: t.size * t.paraGap,
    },
  }));
  slide.addText(runs.length ? runs : [{ text: " " }], { ...box, ...font });
}

function addTable(slide: PptxGenJS.Slide, deck: DeckScene, t: TablePrim) {
  const none: PptxGenJS.BorderProps = { type: "none" };
  // tabledesign.png: header 0.9pt text, rows 0.35pt line, minimal pad
  const headerBorder: [PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps] = [none, none, { type: "solid", pt: 0.9, color: t.headerRule }, none];
  const rowBorder: [PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps, PptxGenJS.BorderProps] = [none, none, { type: "solid", pt: 0.35, color: t.rowRule }, none];
  const face = fontName(deck, t.font);
  const rows: PptxGenJS.TableRow[] = [];
  if (t.headers.length) {
    rows.push(
      t.headers.map((h) => ({
        text: h,
        options: { bold: true, color: t.headerColor, fill: { color: t.headerFill }, fontFace: face, fontSize: t.size, valign: "middle", margin: 0.06, border: headerBorder },
      })),
    );
  }
  for (const r of t.rows) {
    rows.push(r.map((c) => ({ text: c, options: { color: t.textColor, fill: { color: t.fill }, fontFace: face, fontSize: t.size, valign: "middle", margin: 0.06, border: rowBorder } })));
  }
  slide.addTable(rows, { x: t.x, y: t.y, w: t.w, colW: t.colW, autoPage: false });
}

export async function renderPptx(spec: DocumentSpec): Promise<Buffer> {
  const deck = buildDeck(spec);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = spec.title;
  pptx.subject = spec.subtitle ?? spec.docType;
  pptx.author = spec.author ?? "Folio";
  pptx.company = "Folio";

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: s.bg };
    for (const it of s.items) {
      switch (it.kind) {
        case "rect":
          slide.addShape(it.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
            x: it.x,
            y: it.y,
            w: it.w,
            h: it.h,
            fill: { color: it.color, transparency: transparency(it.opacity) },
            line: it.stroke ? { color: it.stroke.color, width: it.stroke.width } : { color: it.color, transparency: 100, width: 0 },
            rectRadius: it.radius || undefined,
          });
          break;
        case "circle":
          slide.addShape(pptx.ShapeType.ellipse, {
            x: it.x,
            y: it.y,
            w: it.d,
            h: it.d,
            fill: { color: it.color, transparency: transparency(it.opacity) },
            line: { color: it.color, transparency: 100, width: 0 },
          });
          break;
        case "text":
          addText(slide, deck, it);
          break;
        case "table":
          addTable(slide, deck, it);
          break;
      }
    }
    if (s.notes) slide.addNotes(s.notes);
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
