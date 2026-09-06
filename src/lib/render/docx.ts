import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
  type ITableCellOptions,
} from "docx";
import { resolveDesign } from "@/lib/design/resolver";
import { getTheme, type Theme } from "@/lib/spec/themes";
import type { Block, DocumentSpec } from "@/lib/spec/types";
import { lightColors } from "./pdf";

type Ctx = {
  c: Theme["colors"];
  head: string;
  body: string;
  contentWidth: number; // twips
  k: number;
  compact: boolean;
  card: string;
};

const NONE: IBorderOptions = { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

/* ------------------------------------------------------------------ */
/*  Small builders                                                      */
/* ------------------------------------------------------------------ */

function run(ctx: Ctx, text: string, o: { bold?: boolean; italic?: boolean; color?: string; size?: number; font?: string; caps?: boolean; spacing?: number } = {}) {
  return new TextRun({
    text,
    bold: o.bold,
    italics: o.italic,
    color: o.color ?? ctx.c.text,
    size: Math.round((o.size ?? (ctx.compact ? 10 : 10.5)) * 2 * ctx.k),
    font: o.font ?? ctx.body,
    allCaps: o.caps,
    characterSpacing: o.spacing,
  });
}

function para(ctx: Ctx, children: TextRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; line?: number; keepNext?: boolean; keepLines?: boolean } = {}) {
  return new Paragraph({
    children,
    alignment: o.align,
    spacing: { before: Math.round((o.before ?? 0) * ctx.k), after: Math.round((o.after ?? 160) * ctx.k), line: Math.round((o.line ?? (ctx.compact ? 276 : 300)) * ctx.k) },
    keepNext: o.keepNext,
    keepLines: o.keepLines,
  });
}

function bodyParagraphs(ctx: Ctx, body: string, color?: string): Paragraph[] {
  return body
    .split(/\n{2,}/)
    .map((s) => s.replace(/\n/g, " ").trim())
    .filter(Boolean)
    .map((text) => para(ctx, [run(ctx, text, { color })], { after: ctx.compact ? 120 : 180, line: ctx.compact ? 276 : 320, keepLines: true }));
}

function bulletParas(ctx: Ctx, items: string[], size?: number): Paragraph[] {
  // Short lists (<=5) travel together via keepNext chain; longer lists keep
  // per-bullet lines intact and let Word break between bullets.
  const chain = items.length <= 5;
  return items.map(
    (text, i) =>
      new Paragraph({
        children: [run(ctx, text, { size })],
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: Math.round((ctx.compact ? 60 : 100) * ctx.k), line: Math.round((ctx.compact ? 264 : 300) * ctx.k) },
        keepLines: true,
        keepNext: chain && i < items.length - 1 ? true : undefined,
      }),
  );
}

function heading(ctx: Ctx, text: string): Paragraph {
  if (ctx.compact) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [run(ctx, text, { bold: true, color: ctx.c.primary, size: 9.5, caps: true, spacing: 26 })],
      spacing: { before: Math.round(220 * ctx.k), after: Math.round(110 * ctx.k) },
      keepNext: true,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line, space: 3 } },
    });
  }
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [run(ctx, text, { bold: true, font: ctx.head, color: ctx.c.primary, size: 17 })],
    spacing: { before: Math.round(420 * ctx.k), after: Math.round(140 * ctx.k) },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ctx.c.line, space: 4 } },
  });
}

function cell(ctx: Ctx, children: (Paragraph | Table)[], width: number, o: Partial<ITableCellOptions> & { fill?: string; pad?: number } = {}) {
  const pad = Math.round((o.pad ?? 140) * ctx.k);
  const { fill, pad: _pad, ...rest } = o;
  void _pad;
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    margins: { top: pad, bottom: pad, left: Math.round(pad * 1.4), right: Math.round(pad * 1.4) },
    verticalAlign: VerticalAlign.TOP,
    borders: noBorders,
    ...rest,
  });
}

function gapCell(width: number) {
  return new TableCell({ children: [new Paragraph("")], width: { size: width, type: WidthType.DXA }, borders: noBorders });
}

function rowTable(cells: TableCell[], widths: number[], width: number, o: { cantSplit?: boolean } = {}) {
  return new Table({ rows: [new TableRow({ children: cells, cantSplit: o.cantSplit })], width: { size: width, type: WidthType.DXA }, columnWidths: widths, borders: noBorders });
}

function callout(ctx: Ctx, text: string, label = "Key takeaway"): Table {
  const w = ctx.contentWidth;
  const children: Paragraph[] = [];
  if (!ctx.compact) children.push(para(ctx, [run(ctx, label.toUpperCase(), { size: 7.5, bold: true, color: ctx.c.muted, spacing: 20 })], { after: 60 }));
  children.push(para(ctx, [run(ctx, text, { bold: true, color: ctx.c.primary, size: 11, font: ctx.head })], { after: 0, line: 300 }));
  return new Table({
    width: { size: w, type: WidthType.DXA },
    columnWidths: [w],
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: w, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: ctx.c.accent, color: "auto" },
            margins: { top: Math.round(180 * ctx.k), bottom: Math.round(180 * ctx.k), left: 260, right: 260 },
            borders: { ...noBorders, left: { style: BorderStyle.SINGLE, size: 30, color: ctx.c.primary } },
            children,
          }),
        ],
      }),
    ],
  });
}

function spacer(ctx: Ctx, after = 200): Paragraph {
  return new Paragraph({ children: [], spacing: { after: Math.round(after * ctx.k) } });
}

function quizParas(ctx: Ctx, qs: NonNullable<Block["quiz"]>): Paragraph[] {
  const out: Paragraph[] = [];
  const letters = ["A", "B", "C", "D", "E", "F"];
  qs.forEach((q, idx) => {
    // Chain each question's paragraphs with keepNext so stem + options + answer
    // travel together; the chain ends at the trailing spacer (no cross-question lock).
    const num = idx + 1;
    out.push(para(ctx, [run(ctx, `${num}. ${q.question}`, { bold: true, size: 10.5 })], { after: 60, keepLines: true, keepNext: true }));
    const type = q.type ?? (q.options.length <= 2 ? "tf" : "mcq");
    if (type === "identification") {
      out.push(para(ctx, [run(ctx, "Answer: _________________________", { size: 10, color: ctx.c.muted })], { after: 40, keepLines: true, keepNext: true }));
      if (q.explanation) out.push(para(ctx, [run(ctx, q.explanation, { size: 9.5, color: ctx.c.muted })], { after: 80, keepLines: true, keepNext: true }));
    } else {
      const opts = q.options.length ? q.options : ["True", "False"];
      opts.forEach((opt, oi) => {
        const label = letters[oi] ?? String(oi + 1);
        out.push(
          new Paragraph({
            children: [run(ctx, `${label}. ${opt}`, { size: 10 })],
            spacing: { after: Math.round(60 * ctx.k), line: Math.round(276 * ctx.k) },
            indent: { left: 360, hanging: 260 },
            keepLines: true,
            keepNext: true,
          }),
        );
      });
      const ans = q.answer ?? (typeof q.answerIndex === "number" && q.options[q.answerIndex] ? q.options[q.answerIndex] : "");
      if (ans) out.push(para(ctx, [run(ctx, `Answer: ${ans}`, { size: 9, bold: true, color: ctx.c.primary })], { after: 40, keepLines: true, keepNext: true }));
      if (q.explanation) out.push(para(ctx, [run(ctx, q.explanation, { size: 9.5, color: ctx.c.muted })], { after: 60, keepLines: true, keepNext: true }));
    }
    out.push(spacer(ctx, 40));
  });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Cover / header / contents                                           */
/* ------------------------------------------------------------------ */

function coverPage(ctx: Ctx, spec: DocumentSpec, b: Block | undefined): (Paragraph | Table)[] {
  const w = ctx.contentWidth;
  const title = b?.title || spec.title;
  const subtitle = b?.subtitle || spec.subtitle;
  // Editorial header rule
  const header = new Paragraph({
    children: [
      new TextRun({ text: (spec.docType || "Folio").toUpperCase(), size: 12, color: ctx.c.muted, font: ctx.body, allCaps: true, characterSpacing: 40 }),
      new TextRun({ text: "\t", size: 12 }),
      new TextRun({ text: spec.date || new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }), size: 12, color: ctx.c.muted, font: ctx.body }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: w }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line, space: 4 } },
    spacing: { after: 400 },
  });
  // Huge condensed title centered
  const tSize = title.length > 58 ? 30 : title.length > 42 ? 36 : title.length > 28 ? 44 : 52;
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: title.toUpperCase(), bold: true, size: tSize * 2, color: ctx.c.text, font: ctx.head, characterSpacing: -10 })],
    spacing: { before: 800, after: 400 },
  });
  // Pills — use subtitle + bullets as pill text
  const pillsRaw: string[] = [];
  if (subtitle) pillsRaw.push(subtitle.toUpperCase());
  if (b?.bullets?.length) pillsRaw.push(...b.bullets.map((x) => x.toUpperCase()).slice(0, 3));
  const pills = pillsRaw.length ? pillsRaw.slice(0, 3) : [spec.docType.toUpperCase()];
  const pillGap = 200;
  const pillW = Math.floor((w - pillGap * (pills.length - 1)) / pills.length);
  const pillCells = pills.map((p) =>
    new TableCell({
      width: { size: pillW, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line }, bottom: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line }, left: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line }, right: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line } },
      shading: { type: ShadingType.CLEAR, fill: ctx.c.bg, color: "auto" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.slice(0, 22), size: 13, color: ctx.c.text, bold: true, characterSpacing: 20 })] })],
    }),
  );
  const gapCells: TableCell[] = [];
  if (pills.length > 1) {
    for (let i = 0; i < pills.length - 1; i++) gapCells.push(new TableCell({ width: { size: pillGap, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph("")] }));
  }
  const pillRowCells: TableCell[] = [];
  pills.forEach((_, i) => {
    pillRowCells.push(pillCells[i]);
    if (i < pills.length - 1) pillRowCells.push(gapCells[i]);
  });
  const pillTable = new Table({
    width: { size: w, type: WidthType.DXA },
    columnWidths: pills.flatMap((_, i) => (i < pills.length - 1 ? [pillW, pillGap] : [pillW])),
    borders: noBorders,
    rows: [new TableRow({ children: pillRowCells })],
  });
  const out: (Paragraph | Table)[] = [header, titlePara, pillTable, spacer(ctx, 400)];
  // optional body as centered abstract
  if (b?.body) {
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(ctx, b.body.replace(/\n+/g, " "), { size: 9, color: ctx.c.muted })], spacing: { before: 200, after: 200 } }));
  }
  // bottom footer rule — lean, project-adopted
  out.push(
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line, space: 6 } },
      spacing: { before: 600 },
      children: [],
    }),
  );
  const footerTxt = (spec.author || spec.subtitle || "").trim().slice(0, 60);
  if (footerTxt) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: footerTxt, size: 12, color: ctx.c.muted, font: ctx.body, allCaps: true, characterSpacing: 40 })],
        spacing: { before: 60, after: 0 },
      }),
    );
  }
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

function compactHeader(ctx: Ctx, spec: DocumentSpec, b: Block | undefined): (Paragraph | Table)[] {
  const title = b?.title || spec.title;
  const subtitle = b?.subtitle || spec.subtitle || "";
  const header = new Paragraph({
    children: [
      new TextRun({ text: (spec.docType || "Folio").toUpperCase(), size: 12, color: ctx.c.muted, font: ctx.body, allCaps: true, characterSpacing: 40 }),
      new TextRun({ text: "\t" + (spec.date || ""), size: 12, color: ctx.c.muted, font: ctx.body }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidth }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line, space: 4 } },
    spacing: { after: 160 },
  });
  const tSize = title.length > 64 ? 19 : title.length > 40 ? 22 : 26;
  const titlePara = new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text: title, bold: true, size: tSize * 2, color: ctx.c.text, font: ctx.head })],
    spacing: { before: 120, after: subtitle ? 60 : 40 },
  });
  const out: (Paragraph | Table)[] = [header, titlePara];
  if (subtitle) {
    out.push(para(ctx, [run(ctx, subtitle, { italic: true, color: ctx.c.muted, size: 11 })], { after: 80 }));
  } else {
    const meta = (b?.bullets ?? []).filter(Boolean).slice(0, 2).join("  ·  ");
    if (meta) out.push(para(ctx, [run(ctx, meta, { size: 9, color: ctx.c.muted })], { after: 60 }));
  }
  if (b?.body) out.push(...bodyParagraphs(ctx, b.body));
  out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line, space: 4 } }, spacing: { after: 100 } }));
  return out;
}

function contents(ctx: Ctx, titles: string[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [heading(ctx, "Contents")];
  titles.forEach((t, i) => {
    out.push(
      new Paragraph({
        children: [run(ctx, String(i + 1).padStart(2, "0"), { bold: true, color: ctx.c.primary, size: 11 }), run(ctx, `   ${t}`, { size: 11 })],
        spacing: { after: 90, line: 300 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line, space: 4 } },
      }),
    );
  });
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

/* ------------------------------------------------------------------ */
/*  Blocks                                                              */
/* ------------------------------------------------------------------ */

function renderBlock(ctx: Ctx, b: Block): (Paragraph | Table)[] {
  const w = ctx.contentWidth;
  const out: (Paragraph | Table)[] = [heading(ctx, b.title)];
  if (b.subtitle) out.push(para(ctx, [run(ctx, b.subtitle, { italic: true, color: ctx.c.muted, size: 10.5 })], { after: 120 }));
  if (b.body) out.push(...bodyParagraphs(ctx, b.body));

  switch (b.layout) {
    case "bullets":
    case "agenda":
      out.push(...bulletParas(ctx, b.bullets));
      break;

    case "groups": {
      for (const g of b.groups ?? []) {
        out.push(
          new Paragraph({
            children: [run(ctx, g.heading, { bold: true, size: 10.5 }), ...(g.meta ? [run(ctx, `\t${g.meta}`, { size: 9, color: ctx.c.muted })] : [])],
            tabStops: [{ type: TabStopType.RIGHT, position: w }],
            spacing: { before: Math.round(80 * ctx.k), after: Math.round(40 * ctx.k), line: Math.round(276 * ctx.k) },
            keepNext: true,
          }),
        );
        if (g.body) out.push(para(ctx, [run(ctx, g.body.replace(/\n+/g, " "), { size: 9.6, color: ctx.c.muted })], { after: 40 }));
        out.push(...bulletParas(ctx, g.bullets, ctx.compact ? 9.8 : 10.2));
      }
      if (b.bullets.length) out.push(...bulletParas(ctx, b.bullets));
      break;
    }

    case "two-column":
    case "comparison": {
      const cols = (b.columns ?? []).slice(0, 4);
      const gap = 240;
      const cw = Math.floor((w - gap * (cols.length - 1)) / cols.length);
      const isComp = b.layout === "comparison";
      const cells: TableCell[] = [];
      cols.forEach((c, i) => {
        const list: Paragraph[] = [];
        if (c.body) list.push(...bodyParagraphs(ctx, c.body));
        list.push(...bulletParas(ctx, c.bullets, 9.8));
        if (isComp) {
          const head = para(ctx, [run(ctx, c.heading ?? (i === 0 ? "Option A" : "Option B"), { bold: true, font: ctx.head, color: ctx.c.text, size: 11 })], { after: 80, line: 260 });
          const headCell = new TableCell({
            width: { size: cw, type: WidthType.DXA },
            borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line } },
            children: [head],
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            verticalAlign: VerticalAlign.CENTER,
          });
          const bodyCell = new TableCell({
            width: { size: cw, type: WidthType.DXA },
            borders: noBorders,
            children: list,
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            verticalAlign: VerticalAlign.TOP,
          });
          cells.push(
            new TableCell({
              width: { size: cw, type: WidthType.DXA },
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              borders: noBorders,
              children: [
                new Table({
                  width: { size: cw, type: WidthType.DXA },
                  columnWidths: [cw],
                  borders: noBorders,
                  rows: [new TableRow({ children: [headCell] }), new TableRow({ children: [bodyCell] })],
                }),
              ],
            }),
          );
        } else {
          const children: Paragraph[] = [];
          if (c.heading) children.push(para(ctx, [run(ctx, c.heading, { bold: true, font: ctx.head, color: ctx.c.text, size: 11 })], { after: 80 }));
          // editorial: no card fill, hairline top + vertical divider via gapCell with left border
          cells.push(cell(ctx, [...children, ...list], cw, { borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line } } }));
        }
        if (i < cols.length - 1) cells.push(gapCell(gap));
      });
      out.push(rowTable(cells, cols.flatMap((_, i) => (i < cols.length - 1 ? [cw, gap] : [cw])), w));
      out.push(spacer(ctx, 120));
      break;
    }

    case "stats": {
      const stats = (b.stats ?? []).slice(0, 4);
      const gap = 200;
      const cw = Math.floor((w - gap * (stats.length - 1)) / stats.length);
      const cells: TableCell[] = [];
      stats.forEach((s, i) => {
        cells.push(
          cell(
            ctx,
            [
              para(ctx, [run(ctx, s.value, { bold: true, size: s.value.length > 9 ? 16 : 22, color: ctx.c.primary, font: ctx.head })], { after: 60 }),
              para(ctx, [run(ctx, s.label, { bold: true, size: 9.5 })], { after: s.description ? 60 : 0 }),
              ...(s.description ? [para(ctx, [run(ctx, s.description, { size: 8.5, color: ctx.c.muted })], { after: 0 })] : []),
            ],
            cw,
            { fill: ctx.card, borders: { ...noBorders, left: { style: BorderStyle.SINGLE, size: 24, color: ctx.c.primary } } },
          ),
        );
        if (i < stats.length - 1) cells.push(gapCell(gap));
      });
      out.push(rowTable(cells, stats.flatMap((_, i) => (i < stats.length - 1 ? [cw, gap] : [cw])), w, { cantSplit: true }));
      out.push(spacer(ctx, 120));
      if (b.bullets.length) out.push(...bulletParas(ctx, b.bullets));
      break;
    }

    case "quote": {
      const q = b.quote;
      if (q) {
        out.push(
          new Table({
            width: { size: w, type: WidthType.DXA },
            columnWidths: [w],
            borders: noBorders,
            rows: [
              new TableRow({
                cantSplit: true,
                children: [
                  new TableCell({
                    width: { size: w, type: WidthType.DXA },
                    shading: { type: ShadingType.CLEAR, fill: ctx.card, color: "auto" },
                    margins: { top: 260, bottom: 260, left: 320, right: 320 },
                    borders: { ...noBorders, left: { style: BorderStyle.SINGLE, size: 30, color: ctx.c.primary } },
                    children: [
                      para(ctx, [run(ctx, `\u201C${q.text}\u201D`, { italic: true, size: 12.5, font: ctx.head, color: ctx.c.text })], { after: q.attribution ? 120 : 0, line: 320 }),
                      ...(q.attribution ? [para(ctx, [run(ctx, `— ${q.attribution}`, { size: 9.5, color: ctx.c.muted })], { after: 0 })] : []),
                    ],
                  }),
                ],
              }),
            ],
          }),
        );
        out.push(spacer(ctx, 160));
      }
      if (b.bullets.length) out.push(...bulletParas(ctx, b.bullets));
      break;
    }

    case "timeline": {
      (b.steps ?? []).forEach((s, i) => {
        out.push(
          new Paragraph({
            children: [
              run(ctx, `${String(i + 1).padStart(2, "0")}  `, { bold: true, color: ctx.c.primary, size: 10.5 }),
              run(ctx, s.label, { bold: true, size: 10.5 }),
              ...(s.description ? [run(ctx, `  —  ${s.description}`, { size: 10.5 })] : []),
            ],
            spacing: { after: Math.round(120 * ctx.k), line: Math.round(300 * ctx.k) },
            indent: { left: 540, hanging: 540 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: ctx.c.line, space: 12 } },
          }),
        );
      });
      out.push(spacer(ctx, 80));
      if (b.bullets.length) out.push(...bulletParas(ctx, b.bullets));
      break;
    }

    case "table": {
      const t = b.table!;
      const cols = Math.max(t.headers.length, ...t.rows.map((r) => r.length), 1);
      const cw = Math.floor(w / cols);
      const rows: TableRow[] = [];
      if (t.headers.some(Boolean)) {
        rows.push(
          new TableRow({
            tableHeader: true,
            children: t.headers.map((h) =>
              cell(ctx, [para(ctx, [run(ctx, h, { bold: true, size: 9.5 })], { after: 0 })], cw, {
                fill: ctx.card,
                pad: 110,
                borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 12, color: ctx.c.primary } },
              }),
            ),
          }),
        );
      }
      t.rows.forEach((r) => {
        rows.push(
          new TableRow({
            children: r.map((c) =>
              cell(ctx, [para(ctx, [run(ctx, c, { size: 9.5 })], { after: 0, line: 276 })], cw, {
                pad: 100,
                borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 4, color: ctx.c.line } },
              }),
            ),
          }),
        );
      });
      out.push(new Table({ rows, width: { size: w, type: WidthType.DXA }, columnWidths: Array(cols).fill(cw), borders: noBorders }));
      out.push(spacer(ctx, 160));
      if (b.bullets.length) out.push(...bulletParas(ctx, b.bullets));
      break;
    }

    case "quiz": {
      if (b.quiz?.length) out.push(...quizParas(ctx, b.quiz));
      if (b.bullets.length) out.push(...bulletParas(ctx, b.bullets));
      break;
    }

    default:
      if (b.bullets.length) out.push(...bulletParas(ctx, b.bullets));
      if (b.quiz?.length) out.push(...quizParas(ctx, b.quiz));
      break;
  }

  if (b.callout) {
    out.push(spacer(ctx, 60));
    out.push(callout(ctx, b.callout, b.layout === "closing" ? "Recommendation" : "Key takeaway"));
    out.push(spacer(ctx, 160));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Entry                                                               */
/* ------------------------------------------------------------------ */

export async function renderDocx(spec: DocumentSpec): Promise<Buffer> {
  const resolved = resolveDesign({
    docType: spec.docType,
    tone: spec.tone,
    audience: spec.audience,
    targetPages: spec.targetPages,
    compact: Boolean(spec.compact),
    preferredTheme: spec.theme as any,
    format: "docx",
  });
  let themeId = spec.theme as string;
  if (themeId === "mono" && resolved.themeId !== "mono") themeId = resolved.themeId;
  const t = getTheme(themeId);
  const c = lightColors(t);
  const k = Math.min(1, Math.max(0.6, spec.density ?? 1));
  const wantCover = resolved.useCover;
  const compact = wantCover ? false : Boolean(spec.compact);

  const pageW = spec.pageSize === "Letter" ? 12240 : 11906;
  const pageH = spec.pageSize === "Letter" ? 15840 : 16838;
  const margin = Math.round((compact ? 1000 : 1300) * (0.86 + 0.14 * k));
  const displayHead = resolved.allowCursive && t.displayFont ? t.displayFont : t.fonts.heading;
  const ctx: Ctx = {
    c,
    head: displayHead,
    body: t.fonts.body,
    contentWidth: pageW - margin * 2,
    k,
    compact,
    card: c.surface.toUpperCase() === "FFFFFF" ? c.bg : c.surface,
  };

  const coverBlock = spec.blocks.find((b) => b.layout === "cover");
  const content = spec.blocks.filter((b) => b.layout !== "cover" && b.layout !== "agenda" && b.layout !== "section");
  const children: (Paragraph | Table)[] = compact ? compactHeader(ctx, spec, coverBlock) : coverPage(ctx, spec, coverBlock);
  if (!compact && (spec.targetPages ?? 0) >= 6 && content.length >= 5) children.push(...contents(ctx, content.map((b) => b.title)));
  const targetPages = spec.targetPages ?? 1;
  content.forEach((b) => {
    const wantsBreak = Boolean((b as any).breakBefore) && targetPages > 1;
    if (wantsBreak) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...renderBlock(ctx, b));
  });

  const singlePage = compact && (spec.targetPages ?? 0) <= 1;
  const bodySize = Math.round((compact ? 10 : 10.5) * 2 * k);

  const doc = new Document({
    creator: spec.author ?? "Folio",
    title: spec.title,
    description: spec.subtitle ?? spec.docType,
    background: c.bg.toUpperCase() !== "FFFFFF" ? { color: c.bg } : undefined,
    styles: {
      default: { document: { run: { font: t.fonts.body, size: bodySize, color: c.text } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: Math.round(17 * 2 * k), bold: true, font: t.fonts.heading, color: c.primary }, paragraph: { spacing: { before: 420, after: 140 }, outlineLevel: 0 } },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: resolved.bulletStyle === "squircle" ? "\u25AA" : resolved.bulletStyle === "hollow" ? "\u25CB" : resolved.bulletStyle === "dash" ? "\u2013" : resolved.bulletStyle === "square" ? "\u25AA" : "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: compact ? 400 : 520, hanging: 260 } }, run: { color: c.primary } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: !compact,
          page: { size: { width: pageW, height: pageH }, margin: { top: compact ? margin : 1300, right: margin, bottom: compact ? margin : 1300, left: margin, header: 560, footer: 560 } },
        },
        headers: singlePage
          ? undefined
          : {
              first: new Header({ children: [new Paragraph("")] }),
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: c.line, space: 4 } },
                    children: [],
                  }),
                ],
              }),
            },
        footers: singlePage
          ? undefined
          : {
              first: new Footer({ children: [new Paragraph("")] }),
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ children: [PageNumber.CURRENT], size: 14, color: c.muted, font: t.fonts.body })],
                  }),
                ],
              }),
            },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
