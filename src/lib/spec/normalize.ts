import type { Block, DocumentSpec, Format, Layout, LengthSource, Outline, OutlineSection } from "./types";
import { DEFAULT_THEME, LAYOUTS } from "./types";

/* ------------------------------------------------------------------ */
/*  Text hygiene                                                        */
/* ------------------------------------------------------------------ */

export function cleanText(input: unknown, opts: { keepNewlines?: boolean } = {}): string {
  if (input === null || input === undefined) return "";
  let s = String(input);
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  s = s.replace(/(^|[^*])\*(?!\*)([^*\n]+)\*(?!\*)/g, "$1$2");
  s = s.replace(/`([^`]+)`/g, "$1");
  // Leading list markers (the renderers draw their own bullets/numbers).
  s = s.replace(/^[ \t]*(?:[-*•▪◦–—]|\d{1,2}[.)])[ \t]+/gm, "");
  s = s.replace(/\[(?:insert|tbd|placeholder|your [^\]]*)\]/gi, "");
  s = s.replace(/[ \t]+/g, " ");
  if (opts.keepNewlines) s = s.replace(/\n{3,}/g, "\n\n").trim();
  else s = s.replace(/\s*\n\s*/g, " ").trim();
  return s;
}

export function cleanBullet(input: unknown, maxChars = 220): string {
  let s = cleanText(input);
  if (s.length > maxChars) {
    const cut = s.slice(0, maxChars);
    const idx = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
    s = (idx > maxChars * 0.5 ? cut.slice(0, idx) : cut).trim() + "…";
  }
  return s;
}

export function slugId(prefix: string, i: number): string {
  return `${prefix}${i + 1}`;
}

/** Keep headline figures short without cutting mid-word. */
export function shortValue(input: string, max = 22): string {
  const s = input.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const idx = cut.lastIndexOf(" ");
  return (idx > 4 ? cut.slice(0, idx) : cut).trim();
}

export function wordCount(text: string | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ------------------------------------------------------------------ */
/*  Length conventions                                                  */
/* ------------------------------------------------------------------ */

export const DEFAULT_LENGTH: Record<Format, number> = { pptx: 10, docx: 3, pdf: 3 };

type Range = [number, number];

/** Ordered from most specific to most generic — first match wins. */
const DOC_CONVENTIONS: { test: RegExp; range: Range }[] = [
  { test: /\b(business plan|research paper|thesis|dissertation|training manual|technical documentation|e-?book|handbook|textbook)\b/, range: [6, 12] },
  { test: /\b(resume|cv|curriculum vitae)\b/, range: [1, 1] },
  { test: /\b(cover letter|letter|recommendation|reference)\b/, range: [1, 1] },
  {
    test: /\b(one[- ]?pager|fact ?sheet|flyer|leaflet|cheat ?sheet|memo(randum)?|agenda|checklist|worksheet|quiz|invoice|receipt|recipe|press release|executive summary|abstract|bio(graphy)?|announcement|notice|poster|infographic|certificate|schedule|timetable|itinerary|job description|job posting|faq|email|speech|toast|statement|sheet|form|template|menu|program|scorecard|rubric)\b/,
    range: [1, 1],
  },
  {
    test: /\b(lesson plan|brief(ing)?|policy (brief|summary)|product sheet|data ?sheet|case study|syllabus|meeting (notes|minutes)|minutes|sop|standard operating procedure|newsletter|script|study notes|notes|summary|overview|profile|pitch|proposal letter)\b/,
    range: [1, 2],
  },
  { test: /\b(essay|article|blog|study guide|book report|review|reflection|op-ed|editorial|tutorial|how-to|guide|explainer|lecture notes|worksheet packet|assignment|homework)\b/, range: [2, 4] },
  { test: /\b(report|proposal|white ?paper|whitepaper|analysis|plan|playbook|grant|literature review|assessment|evaluation|strategy|manual|curriculum|specification|spec|policy|paper|research)\b/, range: [3, 6] },
];

function normalizeDocType(docType: string): string {
  return docType
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Industry-standard page range for a document type, or null when unknown. */
export function conventionPages(docType: string): Range | null {
  const key = normalizeDocType(docType);
  for (const c of DOC_CONVENTIONS) if (c.test.test(key)) return c.range;
  return null;
}

export function suggestedPages(docType: string, format: Format): number {
  if (format === "pptx") return DEFAULT_LENGTH.pptx;
  const c = conventionPages(docType);
  return c ? c[0] : DEFAULT_LENGTH[format];
}

/** Document types that never end with a conclusion section. */
const NO_CONCLUSION = /\b(resume|cv|curriculum|letter|memo|one[- ]?pager|fact ?sheet|flyer|checklist|agenda|quiz|worksheet|recipe|invoice|schedule|itinerary|job description|faq|syllabus|minutes|notes|cheat|sheet|form|menu|program|rubric|template)\b/;

/* ------------------------------------------------------------------ */
/*  Outline normalization                                               */
/* ------------------------------------------------------------------ */

type RawOutline = {
  title: string;
  subtitle?: string;
  format: Format;
  docType?: string;
  purpose?: string;
  audience?: string;
  tone?: string;
  language?: string;
  theme?: string;
  pageSize: Outline["pageSize"];
  targetLength?: number;
  lengthSource?: LengthSource;
  sections: { id?: string; title: string; layout?: Layout; points: string[] }[];
  designNotes?: string;
  suggestedLength?: number;
};

export function normalizeOutline(raw: RawOutline): Outline {
  const format = raw.format;
  const isDeck = format === "pptx";
  const seen = new Set<string>();
  let sections: OutlineSection[] = raw.sections
    .map((s, i) => {
      let id = cleanText(s.id) || slugId("s", i);
      while (seen.has(id)) id = `${id}_${i}`;
      seen.add(id);
      return {
        id,
        title: cleanText(s.title) || `Section ${i + 1}`,
        layout: (s.layout ?? (isDeck ? "bullets" : "paragraph")) as Layout,
        points: s.points.map((p) => cleanBullet(p, 200)).filter(Boolean).slice(0, 8),
      };
    })
    .filter((s) => s.title);

  if (sections.length === 0) {
    sections = [{ id: "s1", title: cleanText(raw.title) || "Overview", layout: "bullets", points: [] }];
  }

  // Structural guarantee: a cover first (it becomes the header for compact documents).
  if (sections[0].layout !== "cover") {
    const first = sections[0];
    if (/^(title|cover|header|introduction slide)$/i.test(first.title) && first.points.length === 0) {
      first.layout = "cover";
    } else {
      sections.unshift({
        id: uniqueId("cover", seen),
        title: cleanText(raw.title) || first.title,
        layout: "cover",
        points: raw.subtitle ? [cleanText(raw.subtitle)] : [],
      });
    }
  }
  sections = sections.filter((s, i) => i === 0 || s.layout !== "cover");

  const docType = cleanText(raw.docType) || (isDeck ? "presentation" : "document");

  // Closing: decks always end with one; documents only when the type calls for it.
  const closingIdxs = sections.map((s, i) => (s.layout === "closing" ? i : -1)).filter((i) => i >= 0);
  if (closingIdxs.length) {
    const keep = closingIdxs[closingIdxs.length - 1];
    const closing = sections[keep];
    sections = sections.filter((_, i) => i !== keep).map((s) => (s.layout === "closing" ? { ...s, layout: "bullets" as Layout } : s));
    if (!isDeck && NO_CONCLUSION.test(normalizeDocType(docType)) && /^(conclusion|summary|closing)$/i.test(closing.title)) {
      // A bogus "Conclusion" on a resume/letter/memo: drop it.
    } else {
      sections.push(closing);
    }
  } else if (isDeck) {
    const last = sections[sections.length - 1];
    if (/^(conclusion|summary|key takeaways|thank you|next steps|closing|wrap[- ]?up)/i.test(last.title)) last.layout = "closing";
    else sections.push({ id: uniqueId("closing", seen), title: "Key Takeaways", layout: "closing", points: [] });
  }

  // Documents get an automatic contents page when long enough; drop explicit agenda sections.
  if (!isDeck) sections = sections.filter((s) => s.layout !== "agenda" && s.layout !== "section");

  // Length: decks are one section per slide; documents follow the user or the convention.
  const convention = isDeck ? null : conventionPages(docType);
  const suggestedLength = isDeck ? sections.length : convention ? convention[0] : DEFAULT_LENGTH[format];
  let targetLength: number;
  let lengthSource: LengthSource = raw.lengthSource === "user" ? "user" : "inferred";
  if (isDeck) {
    targetLength = sections.length;
  } else {
    const requested = raw.targetLength && raw.targetLength > 0 ? Math.min(Math.round(raw.targetLength), 30) : undefined;
    if (lengthSource === "user" && requested) targetLength = requested;
    else if (convention) targetLength = requested ? Math.min(Math.max(requested, convention[0]), convention[1]) : convention[0];
    else targetLength = requested ?? DEFAULT_LENGTH[format];
    if (lengthSource === "user" && !requested) lengthSource = "inferred";
  }

  return {
    title: cleanText(raw.title) || "Untitled",
    subtitle: raw.subtitle ? cleanText(raw.subtitle) : undefined,
    format,
    docType,
    purpose: raw.purpose ? cleanText(raw.purpose) : undefined,
    audience: raw.audience ? cleanText(raw.audience) : undefined,
    tone: raw.tone ? cleanText(raw.tone) : undefined,
    language: cleanText(raw.language) || "English",
    theme: DEFAULT_THEME,
    pageSize: raw.pageSize,
    targetLength,
    lengthSource,
    suggestedLength,
    sections,
    designNotes: raw.designNotes ? cleanText(raw.designNotes) : undefined,
  };
}

function uniqueId(base: string, seen: Set<string>): string {
  let id = base;
  let n = 1;
  while (seen.has(id)) id = `${base}_${n++}`;
  seen.add(id);
  return id;
}

/* ------------------------------------------------------------------ */
/*  Page planning & word budgets (documents)                            */
/* ------------------------------------------------------------------ */

export type PagePlan = {
  compact: boolean;
  coverPage: boolean;
  tocPage: boolean;
  contentPages: number;
  wordsTotal: number;
  contentSections: number;
};

export function pagePlan(outline: Outline): PagePlan {
  const pages = Math.max(1, outline.targetLength);
  const isDeck = outline.format === "pptx";
  const contentSections = outline.sections.filter((s) => s.layout !== "cover" && s.layout !== "agenda").length;
  if (isDeck) return { compact: false, coverPage: false, tocPage: false, contentPages: pages, wordsTotal: 0, contentSections };
  const compact = pages <= 2;
  const coverPage = !compact;
  const tocPage = !compact && pages >= 6 && contentSections >= 5;
  const contentPages = Math.max(1, pages - (coverPage ? 1 : 0) - (tocPage ? 1 : 0));
  const wordsPerPage = compact ? 360 : 420;
  const wordsTotal = Math.max(120, Math.round(contentPages * wordsPerPage - (compact ? 40 : 0)));
  return { compact, coverPage, tocPage, contentPages, wordsTotal, contentSections };
}

/** Per-section word caps that add up to the page plan. */
export function sectionBudgets(outline: Outline): Record<string, number> {
  const plan = pagePlan(outline);
  const out: Record<string, number> = {};
  if (outline.format === "pptx") return out;
  const weight = (l: Layout) => (l === "paragraph" || l === "groups" ? 1.25 : l === "closing" ? 0.9 : l === "stats" || l === "table" || l === "quote" ? 0.7 : 1);
  const content = outline.sections.filter((s) => s.layout !== "cover" && s.layout !== "agenda");
  const sum = content.reduce((a, s) => a + weight(s.layout), 0) || 1;
  for (const s of outline.sections) {
    if (s.layout === "cover") out[s.id] = plan.compact ? 30 : 110;
    else out[s.id] = Math.max(25, Math.round((plan.wordsTotal * weight(s.layout)) / sum));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Block normalization (expand stage)                                  */
/* ------------------------------------------------------------------ */

type RawBlock = {
  id?: string;
  layout?: Layout;
  title: string;
  subtitle?: string;
  body?: string;
  bullets: string[];
  columns?: { heading?: string; bullets: string[]; body?: string }[];
  stats?: { value: string; label: string; description?: string }[];
  quote?: { text: string; attribution?: string };
  steps?: { label: string; description?: string }[];
  groups?: { heading: string; meta?: string; bullets: string[]; body?: string }[];
  table?: { headers: string[]; rows: string[][] };
  quiz?: { question: string; options: string[]; answer?: string; answerIndex?: number; explanation?: string; type?: string }[];
  callout?: string;
  notes?: string;
};

export function normalizeBlock(raw: RawBlock, fallbackId: string, format: Format, hint?: OutlineSection): Block {
  const isDeck = format === "pptx";
  const bulletMax = isDeck ? 160 : 400;

  const bullets = raw.bullets.map((b) => cleanBullet(b, bulletMax)).filter(Boolean);
  const columns = (raw.columns ?? [])
    .map((c) => ({
      heading: c.heading ? cleanText(c.heading) : undefined,
      bullets: c.bullets.map((b) => cleanBullet(b, bulletMax)).filter(Boolean),
      body: c.body ? cleanText(c.body, { keepNewlines: true }) : undefined,
    }))
    .filter((c) => c.bullets.length || c.body || c.heading)
    .slice(0, isDeck ? 3 : 4);
  const stats = (raw.stats ?? [])
    .map((s) => ({ value: shortValue(cleanText(s.value)), label: cleanText(s.label).slice(0, 60), description: s.description ? cleanBullet(s.description, 120) : undefined }))
    .filter((s) => s.value && s.label)
    .slice(0, 4);
  const steps = (raw.steps ?? [])
    .map((s) => ({ label: cleanText(s.label).slice(0, 70), description: s.description ? cleanBullet(s.description, isDeck ? 140 : 400) : undefined }))
    .filter((s) => s.label)
    .slice(0, isDeck ? 5 : 10);
  const groups = (raw.groups ?? [])
    .map((g) => ({
      heading: cleanText(g.heading).slice(0, 120),
      meta: g.meta ? cleanText(g.meta).slice(0, 80) : undefined,
      bullets: g.bullets.map((b) => cleanBullet(b, bulletMax)).filter(Boolean).slice(0, isDeck ? 4 : 8),
      body: g.body ? cleanText(g.body, { keepNewlines: true }) : undefined,
    }))
    .filter((g) => g.heading)
    .slice(0, isDeck ? 6 : 12);
  const quote = raw.quote?.text
    ? { text: cleanBullet(raw.quote.text, isDeck ? 260 : 600), attribution: raw.quote.attribution ? cleanText(raw.quote.attribution) : undefined }
    : undefined;
  let table: Block["table"] | undefined;
  if (raw.table && (raw.table.headers.length || raw.table.rows.length)) {
    const colCount = Math.min(Math.max(raw.table.headers.length, ...raw.table.rows.map((r) => r.length), 1), 6);
    const headers = raw.table.headers.slice(0, colCount).map((h) => cleanText(h));
    while (headers.length < colCount) headers.push("");
    const rows = raw.table.rows
      .slice(0, isDeck ? 7 : 20)
      .map((r) => {
        const row = r.slice(0, colCount).map((c) => cleanBullet(c, isDeck ? 80 : 200));
        while (row.length < colCount) row.push("");
        return row;
      });
    if (rows.length) table = { headers, rows };
  }
  const quiz: Block["quiz"] | undefined = (raw.quiz ?? [])
    .map((q) => ({
      question: cleanText(q.question).slice(0, 220),
      options: (q.options ?? []).map((o) => cleanText(o).slice(0, 120)).filter(Boolean).slice(0, 6),
      answer: q.answer ? cleanText(q.answer).slice(0, 120) : undefined,
      answerIndex: typeof q.answerIndex === "number" ? q.answerIndex : undefined,
      explanation: q.explanation ? cleanBullet(q.explanation, 200) : undefined,
      type: (["mcq", "tf", "identification"].includes((q.type ?? "").toLowerCase()) ? (q.type as Block["quiz"] extends (infer U)[] | undefined ? U extends { type?: infer T } ? T : never : never) : undefined) as Block["quiz"] extends (infer U)[] | undefined ? U extends { type?: infer T } ? T : never : never,
    }))
    .filter((q) => q.question)
    .slice(0, 20) as Block["quiz"] | undefined;
  const body = raw.body ? cleanText(raw.body, { keepNewlines: true }) : undefined;

  let layout: Layout = raw.layout ?? hint?.layout ?? "bullets";

  // Content-driven layout repair: never render an empty layout.
  if (layout === "quiz" && (!quiz || quiz.length < 1)) layout = bullets.length ? "bullets" : "paragraph";
  if (layout === "stats" && stats.length < 2) layout = bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if (layout === "timeline" && steps.length < 2) layout = bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if (layout === "table" && !table) layout = bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if (layout === "quote" && !quote) layout = bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if (layout === "groups" && groups.length < 1) layout = columns.length >= 2 ? "two-column" : bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if ((layout === "two-column" || layout === "comparison") && columns.length < 2) {
    if (groups.length >= 1) layout = "groups";
    else if (bullets.length >= 4 && layout === "two-column") {
      const half = Math.ceil(bullets.length / 2);
      columns.splice(
        0,
        columns.length,
        { heading: undefined, bullets: bullets.slice(0, half), body: undefined },
        { heading: undefined, bullets: bullets.slice(half), body: undefined },
      );
    } else layout = bullets.length ? "bullets" : "paragraph";
  }
  if (layout === "bullets" && bullets.length === 0) {
    if (groups.length) layout = "groups";
    else if (body) layout = "paragraph";
    else if (columns.length >= 2) layout = "two-column";
    else if (stats.length >= 2) layout = "stats";
    else if (steps.length >= 2) layout = "timeline";
    else if (table) layout = "table";
    else if (quote) layout = "quote";
    else if (quiz?.length) layout = "quiz";
  }
  if (layout === "paragraph" && !body) {
    if (bullets.length) layout = "bullets";
    else if (groups.length) layout = "groups";
    else if (hint?.points.length) {
      bullets.push(...hint.points);
      layout = "bullets";
    }
  }
  if (!(LAYOUTS as readonly string[]).includes(layout)) layout = "bullets";

  return {
    id: cleanText(raw.id) || fallbackId,
    layout,
    title: cleanText(raw.title) || hint?.title || "Untitled",
    subtitle: raw.subtitle ? cleanText(raw.subtitle) : undefined,
    body,
    bullets,
    columns: columns.length ? columns : undefined,
    stats: stats.length ? stats : undefined,
    quote,
    steps: steps.length ? steps : undefined,
    groups: groups.length ? groups : undefined,
    table,
    quiz: quiz?.length ? quiz : undefined,
    callout: raw.callout ? cleanBullet(raw.callout, 220) : undefined,
    notes: raw.notes ? cleanText(raw.notes, { keepNewlines: true }) : undefined,
  };
}

/** Deterministic fallback when the model fails for a batch of sections. */
export function blockFromOutlineSection(section: OutlineSection, outline: Outline): Block {
  const points = section.points.length ? section.points : [`Overview of ${section.title}`];
  if (section.layout === "cover") {
    return { id: section.id, layout: "cover", title: outline.title, subtitle: outline.subtitle, bullets: section.points.slice(0, 4) };
  }
  if (section.layout === "closing") return { id: section.id, layout: "closing", title: section.title, bullets: points, callout: outline.subtitle };
  if (outline.format === "pptx") return { id: section.id, layout: "bullets", title: section.title, bullets: points, notes: points.join(". ") };
  return { id: section.id, layout: "bullets", title: section.title, bullets: points };
}

/* ------------------------------------------------------------------ */
/*  Design pass: structure, pacing and overflow control                 */
/* ------------------------------------------------------------------ */

export function designPass(outline: Outline, blocks: Block[], format: Format): DocumentSpec {
  const isDeck = format === "pptx";
  const targetPages = isDeck ? undefined : Math.max(1, outline.targetLength);
  const compact = !isDeck && (targetPages ?? 3) <= 2;
  let out: Block[] = [];
  for (const b of blocks) out.push(...(isDeck ? splitForSlides(b) : [b]));

  const covers = out.filter((b) => b.layout === "cover");
  const rest = out.filter((b) => b.layout !== "cover");
  const cover: Block = covers[0] ?? { id: "cover", layout: "cover", title: outline.title, subtitle: outline.subtitle, bullets: [] };
  cover.title = cover.title || outline.title;
  if (!cover.subtitle && outline.subtitle) cover.subtitle = outline.subtitle;

  const closings = rest.filter((b) => b.layout === "closing");
  const middle = rest.filter((b) => b.layout !== "closing");
  for (const extra of closings.slice(0, -1)) middle.push({ ...extra, layout: extra.bullets.length ? "bullets" : "paragraph" });
  let closing: Block | undefined = closings[closings.length - 1];
  if (isDeck && !closing) {
    closing = {
      id: "closing",
      layout: "closing",
      title: "Key Takeaways",
      bullets: middle
        .filter((b) => b.layout !== "agenda" && b.layout !== "section")
        .slice(0, 4)
        .map((b) => b.title),
    };
  }
  out = closing ? [cover, ...middle, closing] : [cover, ...middle];

  if (isDeck) {
    const contentTitles = middle.filter((b) => b.layout !== "agenda" && b.layout !== "section").map((b) => b.title);
    const hasAgenda = middle.some((b) => b.layout === "agenda");
    if (!hasAgenda && contentTitles.length >= 7) {
      out.splice(1, 0, { id: "agenda", layout: "agenda", title: "Agenda", bullets: dedupe(contentTitles).slice(0, 10) });
    } else if (hasAgenda) {
      const agenda = out.find((b) => b.layout === "agenda")!;
      if (agenda.bullets.length === 0) agenda.bullets = dedupe(contentTitles).slice(0, 10);
    }
  } else {
    out = out.filter((b) => b.layout !== "agenda" && b.layout !== "section");
  }

  let run = 0;
  for (let i = 0; i < out.length; i++) {
    const prev = out[i - 1];
    run = prev && prev.layout === out[i].layout ? run + 1 : 0;
    out[i].variant = run % 2;
  }

  return {
    title: outline.title,
    subtitle: outline.subtitle,
    docType: outline.docType,
    purpose: outline.purpose,
    audience: outline.audience,
    tone: outline.tone,
    language: outline.language,
    theme: outline.theme,
    pageSize: outline.pageSize,
    format,
    targetPages,
    compact,
    density: 1,
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    blocks: out,
  };
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const MAX_BULLETS_PER_SLIDE = 6;

/** Split overloaded slides into continuation slides instead of overflowing. */
function splitForSlides(b: Block): Block[] {
  if (b.layout === "bullets" && b.bullets.length > MAX_BULLETS_PER_SLIDE) {
    const chunks: string[][] = [];
    const per = Math.ceil(b.bullets.length / Math.ceil(b.bullets.length / MAX_BULLETS_PER_SLIDE));
    for (let i = 0; i < b.bullets.length; i += per) chunks.push(b.bullets.slice(i, i + per));
    return chunks.map((c, i) => ({
      ...b,
      id: i === 0 ? b.id : `${b.id}_${i + 1}`,
      title: i === 0 ? b.title : `${b.title} (cont.)`,
      bullets: c,
      callout: i === chunks.length - 1 ? b.callout : undefined,
    }));
  }
  if (b.layout === "groups" && b.groups && b.groups.length > 3) {
    const parts: Block[] = [];
    for (let i = 0, n = 0; i < b.groups.length; i += 3, n++) {
      parts.push({ ...b, id: n === 0 ? b.id : `${b.id}_${n + 1}`, title: n === 0 ? b.title : `${b.title} (cont.)`, groups: b.groups.slice(i, i + 3) });
    }
    return parts;
  }
  if (b.layout === "paragraph" && b.body) {
    const words = wordCount(b.body);
    if (words > 90) {
      const sentences = b.body
        .replace(/\n+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const bullets = sentences.map((s) => cleanBullet(s, 160)).slice(0, 12);
      return splitForSlides({ ...b, layout: "bullets", bullets, body: undefined });
    }
  }
  if (b.layout === "table" && b.table && b.table.rows.length > 7) {
    const rows = b.table.rows;
    const parts: Block[] = [];
    for (let i = 0, n = 0; i < rows.length; i += 7, n++) {
      parts.push({ ...b, id: n === 0 ? b.id : `${b.id}_${n + 1}`, title: n === 0 ? b.title : `${b.title} (cont.)`, table: { headers: b.table.headers, rows: rows.slice(i, i + 7) } });
    }
    return parts;
  }
  return [b];
}

/* ------------------------------------------------------------------ */
/*  Trimming (used by the page-fit loop)                                */
/* ------------------------------------------------------------------ */

export function blockTextLength(b: Block): number {
  let n = (b.body ?? "").length + b.bullets.join(" ").length + (b.callout ?? "").length;
  for (const c of b.columns ?? []) n += (c.body ?? "").length + c.bullets.join(" ").length;
  for (const g of b.groups ?? []) n += (g.body ?? "").length + g.bullets.join(" ").length;
  for (const s of b.steps ?? []) n += (s.description ?? "").length;
  for (const r of b.table?.rows ?? []) n += r.join(" ").length;
  for (const q of b.quiz ?? []) n += q.question.length + q.options.join(" ").length + (q.explanation ?? "").length;
  return n;
}

/** Remove the least essential piece of content from the largest block. Returns null when nothing safe remains. */
export function trimOnce(spec: DocumentSpec): DocumentSpec | null {
  const order = spec.blocks
    .map((b, i) => ({ i, len: blockTextLength(b) }))
    .filter(({ i }) => spec.blocks[i].layout !== "cover")
    .sort((a, b) => b.len - a.len);
  for (const { i } of order) {
    const trimmed = trimBlock(spec.blocks[i]);
    if (trimmed) {
      const blocks = spec.blocks.slice();
      blocks[i] = trimmed;
      return { ...spec, blocks };
    }
  }
  return null;
}

function trimBlock(b: Block): Block | null {
  if (b.callout && b.layout !== "closing") return { ...b, callout: undefined };
  if (b.body) {
    const paras = b.body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    let li = 0;
    paras.forEach((p, i) => {
      if (p.length > paras[li].length) li = i;
    });
    const sentences = paras[li].split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length >= 3) {
      paras[li] = sentences.slice(0, -1).join(" ");
      return { ...b, body: paras.join("\n\n") };
    }
    if (paras.length >= 2) {
      let si = 0;
      paras.forEach((p, i) => {
        if (p.length < paras[si].length) si = i;
      });
      paras.splice(si, 1);
      return { ...b, body: paras.join("\n\n") };
    }
  }
  if (b.bullets.length > 3) return { ...b, bullets: b.bullets.slice(0, -1) };
  if (b.groups?.length) {
    let gi = -1;
    b.groups.forEach((g, i) => {
      if (g.bullets.length > 2 && (gi === -1 || g.bullets.length > b.groups![gi].bullets.length)) gi = i;
    });
    if (gi >= 0) {
      const groups = b.groups.map((g, i) => (i === gi ? { ...g, bullets: g.bullets.slice(0, -1) } : g));
      return { ...b, groups };
    }
    const bi = b.groups.findIndex((g) => g.body);
    if (bi >= 0) return { ...b, groups: b.groups.map((g, i) => (i === bi ? { ...g, body: undefined } : g)) };
  }
  if (b.columns?.length) {
    let ci = -1;
    b.columns.forEach((c, i) => {
      if (c.bullets.length > 2 && (ci === -1 || c.bullets.length > b.columns![ci].bullets.length)) ci = i;
    });
    if (ci >= 0) return { ...b, columns: b.columns.map((c, i) => (i === ci ? { ...c, bullets: c.bullets.slice(0, -1) } : c)) };
  }
  if (b.steps && b.steps.length > 3) return { ...b, steps: b.steps.slice(0, -1) };
  if (b.table && b.table.rows.length > 4) return { ...b, table: { headers: b.table.headers, rows: b.table.rows.slice(0, -1) } };
  if (b.quiz && b.quiz.length > 5) return { ...b, quiz: b.quiz.slice(0, -1) };
  if (b.callout) return { ...b, callout: undefined };
  if (b.quiz && b.quiz.length > 3) return { ...b, quiz: b.quiz.slice(0, -1) };
  if (b.bullets.length === 3) return { ...b, bullets: b.bullets.slice(0, 2) };
  return null;
}

/* ------------------------------------------------------------------ */
/*  Misc                                                                */
/* ------------------------------------------------------------------ */

export function safeFileName(title: string, ext: string): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document";
  return `${base}.${ext}`;
}

export function specToOutline(spec: DocumentSpec, format: Format): Outline {
  const targetLength = format === "pptx" ? spec.blocks.length : spec.targetPages ?? suggestedPages(spec.docType, format);
  return {
    title: spec.title,
    subtitle: spec.subtitle,
    format,
    docType: spec.docType,
    purpose: spec.purpose,
    audience: spec.audience,
    tone: spec.tone,
    language: spec.language,
    theme: spec.theme,
    pageSize: spec.pageSize,
    targetLength,
    lengthSource: spec.targetPages ? "user" : "inferred",
    suggestedLength: suggestedPages(spec.docType, format),
    sections: spec.blocks.map((b) => ({
      id: b.id,
      title: b.title,
      layout: b.layout,
      points: b.bullets.length ? b.bullets : b.body ? [b.body.slice(0, 160)] : [],
    })),
  };
}
