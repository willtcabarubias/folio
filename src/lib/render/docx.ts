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

function para(ctx: Ctx, children: TextRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; line?: number; keepNext?: boolean } = {}) {
  return new Paragraph({
    children,
    alignment: o.align,
    spacing: { before: Math.round((o.before ?? 0) * ctx.k), after: Math.round((o.after ?? 160) * ctx.k), line: Math.round((o.line ?? (ctx.compact ? 276 : 300)) * ctx.k) },
    keepNext: o.keepNext,
  });
}

function bodyParagraphs(ctx: Ctx, body: string, color?: string): Paragraph[] {
  return body
    .split(/\n{2,}/)
    .map((s) => s.replace(/\n/g, " ").trim())
    .filter(Boolean)
    .map((text) => para(ctx, [run(ctx, text, { color })], { after: ctx.compact ? 120 : 180, line: ctx.compact ? 276 : 320 }));
}

function bulletParas(ctx: Ctx, items: string[], size?: number): Paragraph[] {
  return items.map(
    (text) =>
      new Paragraph({
        children: [run(ctx, text, { size })],
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: Math.round((ctx.compact ? 60 : 100) * ctx.k), line: Math.round((ctx.compact ? 264 : 300) * ctx.k) },
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

function rowTable(cells: TableCell[], widths: number[], width: number) {
  return new Table({ rows: [new TableRow({ children: cells })], width: { size: width, type: WidthType.DXA }, columnWidths: widths, borders: noBorders });
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
    const num = idx + 1;
    out.push(para(ctx, [run(ctx, `${num}. ${q.question}`, { bold: true, size: 10.5 })], { after: 60 }));
    const type = q.type ?? (q.options.length <= 2 ? "tf" : "mcq");
    if (type === "identification") {
      out.push(para(ctx, [run(ctx, "Answer: _________________________", { size: 10, color: ctx.c.muted })], { after: 40 }));
      if (q.explanation) out.push(para(ctx, [run(ctx, q.explanation, { size: 9.5, color: ctx.c.muted })], { after: 80 }));
    } else {
      const opts = q.options.length ? q.options : ["True", "False"];
      opts.forEach((opt, oi) => {
        const label = letters[oi] ?? String(oi + 1);
        out.push(
          new Paragraph({
            children: [run(ctx, `${label}. ${opt}`, { size: 10 })],
            spacing: { after: Math.round(60 * ctx.k), line: Math.round(276 * ctx.k) },
            indent: { left: 360, hanging: 260 },
          }),
        );
      });
      const ans = q.answer ?? (typeof q.answerIndex === "number" && q.options[q.answerIndex] ? q.options[q.answerIndex] : "");
      if (ans) out.push(para(ctx, [run(ctx, `Answer: ${ans}`, { size: 9, bold: true, color: ctx.c.primary })], { after: 40 }));
      if (q.explanation) out.push(para(ctx, [run(ctx, q.explanation, { size: 9.5, color: ctx.c.muted })], { after: 60 }));
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
  const band = new Table({
    width: { size: w, type: WidthType.DXA },
    columnWidths: [w],
    borders: noBorders,
    rows: [
      new TableRow({
        height: { value: 7400, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: w, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: ctx.c.primary, color: "auto" },
            margins: { top: 700, bottom: 600, left: 700, right: 700 },
            verticalAlign: VerticalAlign.CENTER,
            borders: noBorders,
            children: [
              para(ctx, [run(ctx, spec.docType.toUpperCase(), { size: 9, color: ctx.c.accent, bold: true, spacing: 40 })], { after: 360 }),
              para(ctx, [run(ctx, title, { size: title.length > 60 ? 24 : 30, bold: true, color: ctx.c.onPrimary, font: ctx.head })], { after: 240, line: 260 }),
              ...(subtitle ? [para(ctx, [run(ctx, subtitle, { size: 13, color: ctx.c.onPrimary })], { after: 0, line: 300 })] : []),
            ],
          }),
        ],
      }),
    ],
  });
  const meta = [spec.author, spec.date].filter(Boolean).join("   ·   ");
  const out: (Paragraph | Table)[] = [band, spacer(ctx, 300)];
  if (b?.body) {
    out.push(para(ctx, [run(ctx, "ABSTRACT", { size: 8, bold: true, color: ctx.c.muted, spacing: 30 })], { after: 120 }));
    out.push(...bodyParagraphs(ctx, b.body));
  }
  if (b?.bullets.length) out.push(...bulletParas(ctx, b.bullets));
  out.push(spacer(ctx, 400));
  out.push(
    new Paragraph({
      children: [run(ctx, meta || spec.title, { size: 10, color: ctx.c.muted })],
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: ctx.c.line, space: 8 } },
      spacing: { before: 200, after: 0 },
    }),
  );
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

function compactHeader(ctx: Ctx, spec: DocumentSpec, b: Block | undefined): (Paragraph | Table)[] {
  const title = b?.title || spec.title;
  const subtitle = b?.subtitle || spec.subtitle;
  const meta = (b?.bullets ?? []).filter(Boolean).join("   ·   ");
  const out: Paragraph[] = [para(ctx, [run(ctx, title, { bold: true, font: ctx.head, color: ctx.c.primary, size: title.length > 40 ? 20 : 24 })], { after: 40, line: 240 })];
  if (subtitle) out.push(para(ctx, [run(ctx, subtitle, { size: 11.5, color: ctx.c.secondary })], { after: 40 }));
  if (meta) out.push(para(ctx, [run(ctx, meta, { size: 9.2, color: ctx.c.muted })], { after: 40 }));
  if (b?.body) out.push(...bodyParagraphs(ctx, b.body));
  const last = out[out.length - 1];
  out[out.length - 1] = new Paragraph({
    children: [],
    spacing: { after: Math.round(120 * ctx.k) },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ctx.c.primary, space: 4 } },
  });
  out.splice(out.length - 1, 0, last);
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
          const head = para(ctx, [run(ctx, c.heading ?? (i === 0 ? "Option A" : "Option B"), { bold: true, font: ctx.head, color: ctx.c.onPrimary, size: 11 })], { after: 0 });
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
                  rows: [new TableRow({ children: [cell(ctx, [head], cw, { fill: i === 0 ? ctx.c.primary : ctx.c.secondary })] }), new TableRow({ children: [cell(ctx, list, cw, { fill: ctx.card })] })],
                }),
              ],
            }),
          );
        } else {
          const children: Paragraph[] = [];
          if (c.heading) children.push(para(ctx, [run(ctx, c.heading, { bold: true, font: ctx.head, color: ctx.c.primary, size: 11 })], { after: 100 }));
          cells.push(cell(ctx, [...children, ...list], cw, { fill: ctx.card, borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 18, color: ctx.c.primary } } }));
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
      out.push(rowTable(cells, stats.flatMap((_, i) => (i < stats.length - 1 ? [cw, gap] : [cw])), w));
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
  const t = getTheme(spec.theme);
  const c = lightColors(t);
  const k = Math.min(1, Math.max(0.6, spec.density ?? 1));
  const compact = Boolean(spec.compact);

  const pageW = spec.pageSize === "Letter" ? 12240 : 11906;
  const pageH = spec.pageSize === "Letter" ? 15840 : 16838;
  const margin = Math.round((compact ? 1000 : 1300) * (0.86 + 0.14 * k));
  const ctx: Ctx = {
    c,
    head: t.fonts.heading,
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
  content.forEach((b) => children.push(...renderBlock(ctx, b)));

  const singlePage = compact && (spec.targetPages ?? 0) <= 1;
  const bodySize = Math.round((compact ? 10 : 10.5) * 2 * k);

  const doc = new Document({
    creator: spec.author ?? "Folio",
    title: spec.title,
    description: spec.subtitle ?? spec.docType,
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
              text: "\u2022",
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
                    alignment: AlignmentType.RIGHT,
                    children: [run(ctx, spec.title, { size: 8, color: c.muted })],
                    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: c.line, space: 4 } },
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
                    children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: c.muted, font: t.fonts.body })],
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
