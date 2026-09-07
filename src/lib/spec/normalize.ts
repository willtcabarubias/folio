import type { Block, DocumentSpec, Format, Layout, LengthSource, Outline, OutlineSection } from "./types";
import { DEFAULT_THEME, LAYOUTS } from "./types";
import { resolveDesign } from "@/lib/design/resolver";

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

/** Detect generic filler sections the normalizer may have added to hit a length target.
 *  Used by validate-style QA (pptx skill pattern): flag before export, never ship silently. */
export function isFillerSection(title: string, points: string[]): boolean {
  const t = (title || "").trim().toLowerCase();
  if (/^(section|key aspect)\s*\d*/i.test(title || "")) return true;
  if (/^key point for .+ — part \d+/i.test(points[0] ?? "")) return true;
  if (/^explain this aspect of /i.test(points[0] ?? "")) return true;
  if (t === "section" || t.startsWith("section ")) return true;
  return false;
}

/** Outline quality check: counts filler, cover-only, empty-point sections. */
export function validateOutlineQuality(sections: { title: string; layout: string; points: string[] }[]): {
  filler: number;
  empty: number;
  contentSections: number;
  ok: boolean;
} {
  let filler = 0;
  let empty = 0;
  let contentSections = 0;
  for (const s of sections) {
    if (s.layout === "cover" || s.layout === "agenda") continue;
    contentSections++;
    if (isFillerSection(s.title, s.points)) filler++;
    else if (!s.points.length && (s.layout === "bullets" || s.layout === "paragraph")) empty++;
  }
  return { filler, empty, contentSections, ok: filler === 0 && contentSections > 0 };
}

/** Build a contextual filler section from real outline context — never generic "Section N".
 *  Derives angle from neighboring section titles + docType so writer has something concrete. */
function contextualFiller(
  topic: string,
  docType: string,
  siblings: { title: string; layout: string }[],
  index: number,
): { title: string; layout: Layout; points: string[] } {
  const angles = [
    `Key insights on ${topic}`,
    `Practical applications of ${topic}`,
    `Challenges and considerations for ${topic}`,
    `Next steps with ${topic}`,
    `Real-world examples of ${topic}`,
    `Deep dive: ${topic} in practice`,
  ];
  const existing = new Set(siblings.map((s) => s.title.toLowerCase()));
  let title = angles[index % angles.length].slice(0, 80);
  let k = 2;
  while (existing.has(title.toLowerCase())) title = `${angles[index % angles.length]} (${k++})`.slice(0, 80);
  // Vary layout so decks don't become a wall of bullets (mirrors expand repair).
  const layout: Layout = index % 3 === 1 ? "two-column" : index % 3 === 2 ? "timeline" : "bullets";
  if (/quiz|worksheet|exam|invoice|receipt|resume|letter|memo|checklist/i.test(docType)) {
    return {
      title,
      layout: "bullets",
      points: [`Core detail for ${topic}`, `Concrete example`, `What to remember`],
    };
  }
  if (layout === "two-column") {
    return { title, layout, points: [`Compare approaches to ${topic}`, `When each works best`, `Recommendation`] };
  }
  if (layout === "timeline") {
    return { title, layout, points: [`First step with ${topic}`, `Then apply and refine`, `Review outcomes`] };
  }
  return {
    title,
    layout: "bullets",
    points: [`Why ${topic} matters here`, `Concrete example or case`, `Implication for the reader`],
  };
}

/** Keep headline figures short without cutting mid-word. */
export function slugId(prefix: string, i: number): string {
  return `${prefix}${i + 1}`;
}

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
/*  Chat hygiene (assistant bubbles must never show tofu boxes)         */
/* ------------------------------------------------------------------ */

// Symbols with a clear meaning get an ASCII fallback; everything else
// pictographic is dropped. Curly quotes/dashes are kept (browsers render them).
const CHAT_SYMBOL_MAP: Record<string, string> = {
  "\u2192": "->",
  "\u2190": "<-",
  "\u2194": "<->",
  "\u21D2": "=>",
  "\u2265": ">=",
  "\u2264": "<=",
  "\u2260": "!=",
  "\u2212": "-",
  "\u2248": "~",
  "\u00A0": " ",
  "\u2009": " ",
  "\u200B": "",
};

// Emoji / dingbats / variation selectors / tag characters / object
// replacement char. These render as tofu boxes on systems without
// color-emoji fonts.
const CHAT_STRIP_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{20E3}\u{E0020}-\u{E007F}\u{FFFD}]/gu;
// Keycap sequences (9 + VS15/VS16 + enclosing keycap) must go WHOLE —
// stripping only the combiners leaves stray digits behind ("Got it 28").
// Covers text-style VS15 (FE0E), repeated selectors, and fullwidth bases.
const CHAT_KEYCAP_RE = /[#*0-9\uFF10-\uFF19\uFF03\uFF0A][\uFE00-\uFE0F]*\u20E3/gu;
const CHAT_CONTROL_RE = /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Bulletproof assistant chat text: the free-tier model ignores no-emoji
 * instructions, so enforce it in code. Maps meaningful symbols to ASCII,
 * drops emoji (including whole keycap sequences), replacement chars,
 * lone surrogates and control characters.
 */
export function sanitizeChatMessage(input: unknown): string {
  if (input === null || input === undefined) return "";
  let s = String(input);
  s = s.replace(/\r\n?/g, "\n");
  for (const [k, v] of Object.entries(CHAT_SYMBOL_MAP)) s = s.split(k).join(v);
  s = s.replace(CHAT_KEYCAP_RE, "");
  s = s.replace(CHAT_STRIP_RE, "");
  s = s.replace(CHAT_CONTROL_RE, "");
  // Lone UTF-16 surrogates (invalid halves) - no lookbehind for wide support.
  s = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "");
  s = s.replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1");
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/**
 * Deterministic parse of an explicit word/char request from free text.
 * Does not rely on the LLM: "500 words" -> { words: 500, pages: 2 },
 * "1000-word essay" -> { words: 1000, pages: 3 }, "3000 chars" -> { words: ~500, pages: 2 }.
 * Returns null when no explicit request is found. Last match wins (call with joined transcript).
 */
export function parseRequestedWords(text: string | undefined | null): { words: number; pages: number } | null {
  if (!text) return null;
  const re = /(\d[\d,]*)\s*(words?|w\b|chars?(?:acters?)?|c\b)|(\d[\d,]*)\s*-\s*words?/gi;
  let last: { words: number; pages: number } | null = null;
  let m: RegExpExecArray | null;
  // Also handle "1000-word" / "500 word essay" hyphenated forms
  const hyphen = /(\d[\d,]*)\s*-\s*words?/gi;
  const combined = `${text}`;
  while ((m = re.exec(combined)) !== null) {
    const numRaw = (m[1] ?? m[3] ?? "").replace(/,/g, "");
    const unit = (m[2] ?? "words").toLowerCase();
    const n = parseInt(numRaw, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (unit.startsWith("char") || unit === "c") {
      const words = Math.max(1, Math.round(n / 5.5));
      last = { words: Math.min(words, 20000), pages: Math.max(1, Math.min(30, Math.ceil(words / 380))) };
    } else {
      if (n > 20000) continue; // ignore absurd numbers (likely years like 2026)
      last = { words: n, pages: Math.max(1, Math.min(30, Math.ceil(n / 380))) };
    }
  }
  while ((m = hyphen.exec(combined)) !== null) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0 || n > 20000) continue;
    last = { words: n, pages: Math.max(1, Math.min(30, Math.ceil(n / 380))) };
  }
  return last;
}

/** Total actual words in a built spec (content sections, excluding cover header chrome). */
export function specWordCount(spec: DocumentSpec): number {
  let n = 0;
  for (const b of spec.blocks) {
    if (b.layout === "cover") continue;
    n += wordCount(b.body);
    for (const x of b.bullets) n += wordCount(x);
    for (const c of b.columns ?? []) {
      n += wordCount(c.body);
      for (const x of c.bullets) n += wordCount(x);
      n += wordCount(c.heading);
    }
    for (const g of b.groups ?? []) {
      n += wordCount(g.heading) + wordCount(g.meta) + wordCount(g.body);
      for (const x of g.bullets) n += wordCount(x);
    }
    for (const s of b.steps ?? []) n += wordCount(s.label) + wordCount(s.description);
    for (const r of b.table?.rows ?? []) for (const cell of r) n += wordCount(cell);
    for (const q of b.quiz ?? []) {
      n += wordCount(q.question) + wordCount(q.explanation);
      for (const o of q.options) n += wordCount(o);
    }
    n += wordCount(b.callout);
  }
  return n;
}

/* ------------------------------------------------------------------ */
/*  Length conventions                                                  */
/* ------------------------------------------------------------------ */

export const DEFAULT_LENGTH: Record<Format, number> = { pptx: 10, docx: 3, pdf: 3 };

type Range = [number, number];

/** Ordered from most specific to most generic — first match wins. */
const DOC_CONVENTIONS: { test: RegExp; range: Range }[] = [
  { test: /\b(business plan|research paper|thesis|dissertation|action research|training manual|technical documentation|e-?book|handbook|textbook)\b/, range: [6, 12] },
  { test: /\b(resume|cv|curriculum vitae)\b/, range: [1, 1] },
  { test: /\b(cover letter|letter|recommendation|reference)\b/, range: [1, 1] },
  {
    test: /\b(one[- ]?pager|fact ?sheet|flyer|leaflet|cheat ?sheet|memo(randum)?|agenda|checklist|worksheet|quiz|invoice|receipt|recipe|press release|executive summary|abstract|bio(graphy)?|announcement|notice|poster|infographic|certificate|schedule|timetable|itinerary|job description|job posting|faq|email|speech|toast|statement|sheet|form|template|menu|program|scorecard|rubric|handout)\b/,
    range: [1, 1],
  },
  {
    test: /\b(lesson plan|brief(ing)?|policy (brief|summary)|product sheet|data ?sheet|meeting (notes|minutes)|minutes|sop|standard operating procedure|newsletter|script|study notes|notes|summary|overview|profile|pitch|proposal letter|reviewer)\b/,
    range: [1, 2],
  },
  { test: /\b(essay|article|blog|study guide|book report|review|reflection|narrative|op-ed|editorial|tutorial|how-to|guide|explainer|lecture notes|worksheet packet|assignment|homework|position paper|syllabus)\b/, range: [2, 4] },
  // Specific school formats first (generic "report"/"paper" below would overclaim them).
  { test: /\b(reaction paper)\b/, range: [1, 2] },
  { test: /\b(talumpati|news|balita|poem|tula|activity|performance task|gawain|tos|table of specifications)\b/, range: [1, 2] },
  { test: /\b(case study)\b/, range: [3, 6] },
  { test: /\b(lab report|experiment report|investigatory( project)?)\b/, range: [2, 4] },
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
const NO_CONCLUSION = /\b(resume|cv|curriculum|letter|memo|one[- ]?pager|fact ?sheet|flyer|checklist|agenda|quiz|worksheet|recipe|invoice|schedule|itinerary|job description|faq|syllabus|minutes|notes|cheat|sheet|form|menu|program|rubric|tos|template|activity|reflection|announcement|certificate)\b/;

/* ------------------------------------------------------------------ */
/*  Outline normalization                                               */
/* ------------------------------------------------------------------ */

type RawOutline = {
  title: string;
  subtitle?: string;
  header?: { group?: string; members?: string[] | string; subject?: string; section?: string };
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
  requestedWords?: number;
  sections: { id?: string; title: string; layout?: Layout; points: string[] }[];
  designNotes?: string;
  suggestedLength?: number;
};

function normalizeHeader(raw: RawOutline["header"]): Outline["header"] {
  if (!raw) return undefined;
  const group = typeof raw.group === "string" && raw.group.trim() ? raw.group.trim().slice(0, 60) : undefined;
  const subject = typeof raw.subject === "string" && raw.subject.trim() ? raw.subject.trim().slice(0, 60) : undefined;
  const section = typeof raw.section === "string" && raw.section.trim() ? raw.section.trim().slice(0, 60) : undefined;
  const list = Array.isArray(raw.members) ? raw.members : typeof raw.members === "string" ? raw.members.split(/\n+/) : [];
  const members = list
    .map((m) => String(m ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!group && !members.length && !subject && !section) return undefined;
  return { ...(group ? { group } : {}), ...(members.length ? { members } : {}), ...(subject ? { subject } : {}), ...(section ? { section } : {}) };
}

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

  // Closing: decks keep a mirror end shell (title mirrors outline, never forced takeaways);
  // documents keep closing ONLY if the planner/user explicitly included one.
  const closingIdxs = sections.map((s, i) => (s.layout === "closing" ? i : -1)).filter((i) => i >= 0);
  if (closingIdxs.length) {
    const keep = closingIdxs[closingIdxs.length - 1];
    const closing = sections[keep];
    sections = sections.filter((_, i) => i !== keep).map((s) => (s.layout === "closing" ? { ...s, layout: "bullets" as Layout } : s));
    if (!isDeck && NO_CONCLUSION.test(normalizeDocType(docType)) && /^(conclusion|summary|closing)$/i.test(closing.title)) {
      // A bogus "Conclusion" on a resume/letter/memo: drop it.
    } else if (!isDeck && /^(key takeaways|key details.*takeaways?|putting it into practice)\s*:?$/i.test(closing.title)) {
      // Writer-invented takeaways without user request: drop for docs (expand-in-place covers budget).
    } else {
      sections.push(closing);
    }
  } else if (isDeck) {
    const last = sections[sections.length - 1];
    if (/^(conclusion|summary|key takeaways|thank you|next steps|closing|wrap[- ]?up)/i.test(last.title)) last.layout = "closing";
    else {
      // Mirror shell uses the document title — never a forced "Key Takeaways".
      sections.push({ id: uniqueId("closing", seen), title: cleanText(raw.title) || last.title, layout: "closing", points: [] });
    }
  }

  // Documents get an automatic contents page when long enough; drop explicit agenda sections.
  if (!isDeck) sections = sections.filter((s) => s.layout !== "agenda" && s.layout !== "section");

  // Length: decks are one section per slide; documents follow the user or the convention.
  const convention = isDeck ? null : conventionPages(docType);
  const suggestedLength = isDeck ? sections.length : convention ? convention[0] : DEFAULT_LENGTH[format];
  let targetLength: number;
  let lengthSource: LengthSource = raw.lengthSource === "user" ? "user" : "inferred";
  const requestedRaw = raw.targetLength && raw.targetLength > 0 ? Math.min(Math.round(raw.targetLength), 30) : undefined;
  if (isDeck) {
    if (lengthSource === "user" && requestedRaw) {
      targetLength = requestedRaw;
      // Enforce exact slide count: pad with contextual sections (never generic "Section N")
      // or trim middle while preserving cover/closing.
      if (sections.length < targetLength) {
        const need = targetLength - sections.length;
        const hasClosing = sections[sections.length - 1]?.layout === "closing";
        const insertAt = hasClosing ? sections.length - 1 : sections.length;
        const topic = cleanText(raw.title) || "topic";
        for (let i = 0; i < need; i++) {
          const filler = contextualFiller(topic, docType, sections, i);
          const fillerId = uniqueId(`s_ctx${i + 1}`, seen);
          sections.splice(insertAt + i, 0, { id: fillerId, ...filler });
        }
      } else if (sections.length > targetLength) {
        const cover = sections[0]?.layout === "cover" ? [sections[0]] : [];
        const closing = sections[sections.length - 1]?.layout === "closing" ? [sections[sections.length - 1]] : [];
        const middle = sections.filter((_, i) => !(cover.length && i === 0) && !(closing.length && i === sections.length - 1));
        const keepMiddle = Math.max(0, targetLength - cover.length - closing.length);
        sections = [...cover, ...middle.slice(0, keepMiddle), ...closing];
        // If trimming left us short (e.g. cover+closing only), pad contextually — never empty.
        const topic2 = cleanText(raw.title) || "topic";
        let padIdx = 0;
        while (sections.length < targetLength) {
          const filler = contextualFiller(topic2, docType, sections, padIdx++);
          const fid = uniqueId(`s_ctxpad${padIdx}`, seen);
          sections.splice(sections.length - (closing.length ? 1 : 0), 0, { id: fid, ...filler });
        }
      }
    } else {
      targetLength = sections.length;
      if (lengthSource === "user" && !requestedRaw) lengthSource = "inferred";
    }
  } else {
    if (lengthSource === "user" && requestedRaw) {
      // Respect explicit user length — do not clamp to convention
      targetLength = requestedRaw;
    } else {
      if (lengthSource === "user" && !requestedRaw) lengthSource = "inferred";
      if (convention) targetLength = requestedRaw ? Math.min(Math.max(requestedRaw, convention[0]), convention[1]) : convention[0];
      else targetLength = requestedRaw ?? DEFAULT_LENGTH[format];
    }
    // Enforce minimum section count for explicit doc lengths — a 1-section
    // (cover-only) outline can never satisfy a 2+ page request. Pad with
    // contextual sections so the writer has concrete angles (no generic filler).
    if (lengthSource === "user" && targetLength >= 2) {
      const desiredMin = targetLength <= 1 ? 3 : targetLength === 2 ? 5 : Math.min(targetLength * 2, 9);
      if (sections.length < desiredMin) {
        const hasClosing = sections[sections.length - 1]?.layout === "closing";
        const insertAt = hasClosing ? sections.length - 1 : sections.length;
        const topic = cleanText(raw.title) || "topic";
        let n = 0;
        while (sections.length < desiredMin) {
          const filler = contextualFiller(topic, docType, sections, n);
          const fillerId = uniqueId(`s_pad${n + 1}`, seen);
          sections.splice(insertAt + n, 0, { id: fillerId, ...filler });
          n++;
        }
      }
    }
  }

  // Strict word target: prefer explicit requestedWords (validated), else raw passthrough.
  const requestedWords =
    typeof raw.requestedWords === "number" && Number.isFinite(raw.requestedWords) && raw.requestedWords > 0
      ? Math.min(Math.round(raw.requestedWords), 20000)
      : undefined;

  // Theme: respect explicit request, otherwise default to resolver-friendly warm via DEFAULT
  const rawTheme = typeof (raw as any).theme === "string" ? String((raw as any).theme).toLowerCase().trim() : "";
  const allowed = new Set<string>(["mono", "azure", "executive", "academic", "midnight", "coral", "forest", "slate", "plum", "warm", "noir", "cool"]);
  const theme = allowed.has(rawTheme) ? (rawTheme as any) : DEFAULT_THEME;
  return {
    title: cleanText(raw.title) || "Untitled",
    subtitle: raw.subtitle ? cleanText(raw.subtitle) : undefined,
    header: normalizeHeader(raw.header),
    format,
    docType,
    purpose: raw.purpose ? cleanText(raw.purpose) : undefined,
    audience: raw.audience ? cleanText(raw.audience) : undefined,
    tone: raw.tone ? cleanText(raw.tone) : undefined,
    language: cleanText(raw.language) || "English",
    theme,
    pageSize: raw.pageSize,
    targetLength,
    lengthSource,
    requestedWords,
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

/**
 * Effective word budget for a document (ruling: page-fill wins on conflict).
 * A beautiful full page holds ~380 words, so the budget is the page capacity
 * unless the user asked for MORE words than that — never less.
 * Single source of truth for writer budgets, top-up thresholds and the UI counter.
 */
export function effectiveWordTarget(pages: number, requestedWords?: number): number {
  const capacity = Math.max(1, Math.round(pages)) * 380;
  const asked = typeof requestedWords === "number" && requestedWords > 0 ? Math.min(20000, Math.round(requestedWords)) : 0;
  return Math.max(120, capacity, asked);
}

export function pagePlan(outline: Outline): PagePlan {
  const pages = Math.max(1, outline.targetLength);
  const isDeck = outline.format === "pptx";
  const contentSections = outline.sections.filter((s) => s.layout !== "cover" && s.layout !== "agenda").length;
  if (isDeck) return { compact: false, coverPage: false, tocPage: false, contentPages: pages, wordsTotal: 0, contentSections };
  // Docs: strip cover + TOC — always compact inline header
  const compact = true;
  const coverPage = false;
  const tocPage = false;
  const contentPages = Math.max(1, pages);
  const wordsTotal = effectiveWordTarget(contentPages, outline.requestedWords);
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
  // Tight caps for editorial slides: large type needs short lines (≤12 words ≈ 80 chars inc avg 6.5)
  const bulletMax = isDeck ? 80 : 400;

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
    .map((s) => ({ label: cleanText(s.label).slice(0, 48), description: s.description ? cleanBullet(s.description, isDeck ? 90 : 400) : undefined }))
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
  // No heuristic column fabrication — 2/3-col choice is model-driven only (user wants token uniformity).
  if (layout === "quiz" && (!quiz || quiz.length < 1)) layout = bullets.length ? "bullets" : "paragraph";
  if (layout === "stats" && stats.length < 2) layout = bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if (layout === "timeline" && steps.length < 2) layout = bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if (layout === "table" && !table) layout = bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if (layout === "quote" && !quote) layout = bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if (layout === "groups" && groups.length < 1) layout = columns.length >= 2 ? "two-column" : bullets.length ? "bullets" : quiz?.length ? "quiz" : "paragraph";
  if ((layout === "two-column" || layout === "comparison") && columns.length < 2) {
    if (groups.length >= 1) layout = "groups";
    else layout = bullets.length ? "bullets" : body ? "paragraph" : quiz?.length ? "quiz" : "paragraph";
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
    // callout only if LLM explicitly supplied one and user wants it — no auto-generation downstream
    callout: raw.callout ? cleanBullet(raw.callout, 140) : undefined,
    notes: raw.notes ? cleanText(raw.notes, { keepNewlines: true }) : undefined,
  };
}

/** Deterministic fallback when the model fails for a batch of sections. */
export function blockFromOutlineSection(section: OutlineSection, outline: Outline): Block {
  const points = section.points.length ? section.points.slice(0, 5) : [`Overview of ${section.title}`];
  if (section.layout === "cover") {
    return { id: section.id, layout: "cover", title: outline.title, subtitle: outline.subtitle, bullets: section.points.slice(0, 3) };
  }
  if (section.layout === "closing")
    return { id: section.id, layout: "closing", title: section.title || outline.title, subtitle: outline.subtitle, bullets: points.slice(0, 3) };
  if (outline.format === "pptx") return { id: section.id, layout: "bullets", title: section.title, bullets: points.slice(0, 4) };
  return { id: section.id, layout: "bullets", title: section.title, bullets: points };
}

/* ------------------------------------------------------------------ */
/*  Design pass: structure, pacing and overflow control                 */
/* ------------------------------------------------------------------ */

export function designPass(outline: Outline, blocks: Block[], format: Format): DocumentSpec {
  const isDeck = format === "pptx";
  const targetPages = isDeck ? undefined : Math.max(1, outline.targetLength);
  // Docs: always compact (no dedicated cover page), decks keep cover
  const compact = isDeck ? false : true;
  // Hybrid architecture: resolve theme ONCE here (single source of truth).
  // Renderers must honor spec.theme as-is; "mono" means auto and is resolved here,
  // so pdf/docx/slides can no longer drift to different themes.
  let resolvedTheme = outline.theme;
  try {
    const r = resolveDesign({
      docType: outline.docType,
      tone: outline.tone,
      audience: outline.audience,
      targetPages: targetPages ?? undefined,
      compact,
      preferredTheme: outline.theme as never,
      format,
    });
    resolvedTheme = r.themeId as typeof resolvedTheme;
  } catch {
    // If resolver unavailable (tests), keep outline theme.
  }
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
  // Docs: keep closing ONLY when the outline explicitly requested one.
  // Writer-invented "Key Takeaways / Putting It Into Practice" is stripped as framing:
  // substantive content is demoted to bullets (preserved), empty framing is dropped.
  if (!isDeck && closing) {
    const outlineHasClosing = outline.sections.some((s) => s.layout === "closing");
    const looksInvented = /^(key takeaways|key details.*|putting it into practice|takeaways?)\s*:?$/i.test(closing.title || "");
    if (!outlineHasClosing && looksInvented) {
      if (closing.bullets.length || closing.body) {
        middle.push({ ...closing, layout: closing.bullets.length ? "bullets" : "paragraph" });
      }
      closing = undefined;
    }
  }
  // Editorial closing mirrors cover — no synthetic "Key Takeaways". Only keep explicit closings; if none, create a minimal editorial end that mirrors cover.
  if (isDeck && !closing) {
    closing = {
      id: "closing",
      layout: "closing",
      title: outline.title,
      subtitle: outline.subtitle ?? "Thank You",
      bullets: [],
    };
  } else if (isDeck && closing) {
    // Normalize closing: keep title/subtitle as-is; drop synthetic bullet takeaways if they are just section titles and not real content
    if (!closing.subtitle && outline.subtitle) closing.subtitle = outline.subtitle;
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

  // Pagination hint: Part A/B, Section II, Chapter 2 etc. prefer fresh page when >1 page total.
  // Honored by pdf/docx renderers only when targetPages > 1 (1-page forces single page).
  const partRe = /^\s*(Part\s+[A-Z0-9]+|Section\s+\d+|Chapter\s+\d+|Module\s+\d+|Unit\s+\d+)\b/i;
  for (let i = 1; i < out.length; i++) {
    if (partRe.test(out[i].title)) out[i].breakBefore = true;
  }

  return {
    title: outline.title,
    subtitle: outline.subtitle,
    header: outline.header,
    docType: outline.docType,
    purpose: outline.purpose,
    audience: outline.audience,
    tone: outline.tone,
    language: outline.language,
    theme: resolvedTheme,
    pageSize: outline.pageSize,
    format,
    originFormat: format,
    targetPages,
    requestedWords: outline.requestedWords,
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

const MAX_BULLETS_PER_SLIDE = 5;

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
  // Pricing variant supports 4 cards; keep groups at 4 max for editorial 4-col grid (mutiplecolumn.png)
  if (b.layout === "groups" && b.groups && b.groups.length > 4) {
    const parts: Block[] = [];
    for (let i = 0, n = 0; i < b.groups.length; i += 4, n++) {
      parts.push({ ...b, id: n === 0 ? b.id : `${b.id}_${n + 1}`, title: n === 0 ? b.title : `${b.title} (cont.)`, groups: b.groups.slice(i, i + 4) });
    }
    return parts;
  }
  if (b.layout === "paragraph" && b.body) {
    const words = wordCount(b.body);
    if (words > 75) {
      const sentences = b.body
        .replace(/\n+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const bullets = sentences.map((s) => cleanBullet(s, 80)).slice(0, 8);
      return splitForSlides({ ...b, layout: "bullets", bullets, body: undefined });
    }
  }
  if (b.layout === "table" && b.table && b.table.rows.length > 6) {
    const rows = b.table.rows;
    const parts: Block[] = [];
    for (let i = 0, n = 0; i < rows.length; i += 6, n++) {
      parts.push({ ...b, id: n === 0 ? b.id : `${b.id}_${n + 1}`, title: n === 0 ? b.title : `${b.title} (cont.)`, table: { headers: b.table.headers, rows: rows.slice(i, i + 6) } });
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
    header: spec.header,
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
    requestedWords: spec.requestedWords,
    suggestedLength: suggestedPages(spec.docType, format),
    sections: spec.blocks.map((b) => ({
      id: b.id,
      title: b.title,
      layout: b.layout,
      points: b.bullets.length ? b.bullets : b.body ? [b.body.slice(0, 160)] : [],
    })),
  };
}
