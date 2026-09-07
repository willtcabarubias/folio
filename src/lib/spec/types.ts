import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const FORMATS = ["pptx", "docx", "pdf"] as const;
export type Format = (typeof FORMATS)[number];

export const LAYOUTS = [
  "cover",
  "agenda",
  "section",
  "bullets",
  "two-column",
  "stats",
  "quote",
  "timeline",
  "comparison",
  "table",
  "paragraph",
  "groups",
  "closing",
  "quiz",
] as const;
export type Layout = (typeof LAYOUTS)[number];

export const THEME_IDS = ["mono", "azure", "executive", "academic", "midnight", "coral", "forest", "slate", "plum", "warm", "noir", "cool"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "mono";

export const PAGE_SIZES = ["A4", "Letter"] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type LengthSource = "user" | "inferred";

/* ------------------------------------------------------------------ */
/*  Lenient coercion helpers (LLM output is never fully trusted)        */
/* ------------------------------------------------------------------ */

const str = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return v;
}, z.string());

const optStr = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, z.string().optional());

const strList = z.preprocess((v) => {
  if (v === null || v === undefined) return [];
  if (typeof v === "string") return v.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          return String(o.text ?? o.title ?? o.point ?? o.label ?? o.value ?? o.name ?? "");
        }
        return x === null || x === undefined ? "" : String(x);
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string()));

const layoutEnum = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const key = v.toLowerCase().trim().replace(/[\s_]+/g, "-");
  const aliases: Record<string, Layout> = {
    title: "cover",
    "title-slide": "cover",
    header: "cover",
    intro: "cover",
    contents: "agenda",
    toc: "agenda",
    overview: "agenda",
    divider: "section",
    "section-header": "section",
    chapter: "section",
    list: "bullets",
    bullet: "bullets",
    "bullet-points": "bullets",
    skills: "bullets",
    columns: "two-column",
    "two-columns": "two-column",
    "2-column": "two-column",
    numbers: "stats",
    metrics: "stats",
    kpi: "stats",
    steps: "timeline",
    process: "timeline",
    roadmap: "timeline",
    procedure: "timeline",
    versus: "comparison",
    "pros-cons": "comparison",
    text: "paragraph",
    prose: "paragraph",
    body: "paragraph",
    entries: "groups",
    entry: "groups",
    experience: "groups",
    education: "groups",
    projects: "groups",
    subsections: "groups",
    "list-groups": "groups",
    grouped: "groups",
    roles: "groups",
    cards: "groups",
    summary: "closing",
    conclusion: "closing",
    end: "closing",
    "thank-you": "closing",
  };
  if ((LAYOUTS as readonly string[]).includes(key)) return key;
  return aliases[key] ?? undefined;
}, z.enum(LAYOUTS).optional());

const formatEnum = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const key = v.toLowerCase().trim();
  if (["pptx", "ppt", "slides", "presentation", "deck", "powerpoint"].includes(key)) return "pptx";
  if (["docx", "doc", "word", "document"].includes(key)) return "docx";
  if (["pdf"].includes(key)) return "pdf";
  return undefined;
}, z.enum(FORMATS));

const themeEnum = z.preprocess((v) => {
  if (typeof v !== "string") return DEFAULT_THEME;
  const key = v.toLowerCase().trim();
  return (THEME_IDS as readonly string[]).includes(key) ? key : DEFAULT_THEME;
}, z.enum(THEME_IDS));

const pageSizeEnum = z.preprocess((v) => {
  if (typeof v !== "string") return "A4";
  const key = v.toLowerCase().trim();
  return key === "letter" || key === "us letter" ? "Letter" : "A4";
}, z.enum(PAGE_SIZES));

const intCoerce = z.preprocess((v) => {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    if (!m) return undefined;
    const n = parseInt(m[0], 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}, z.number().int().optional());

const requestedWordsCoerce = z.preprocess((v) => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    if (!m) return undefined;
    const n = parseInt(m[0], 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}, z.number().int().positive().max(20000).optional());

const lengthSourceEnum = z.preprocess((v) => {
  if (typeof v !== "string") return "inferred";
  const key = v.toLowerCase().trim();
  return key === "user" || key === "explicit" || key === "requested" ? "user" : "inferred";
}, z.enum(["user", "inferred"]));

/* ------------------------------------------------------------------ */
/*  Stage 1 — Outline                                                   */
/* ------------------------------------------------------------------ */

export const OutlineSectionSchema = z.object({
  id: optStr,
  title: str,
  layout: layoutEnum,
  points: strList.default([]),
});
export type OutlineSection = { id: string; title: string; layout: Layout; points: string[] };

/* ------------------------------------------------------------------ */
/*  Cover-only header (Group + members)                                 */
/*                                                                      */
/*  Rendered ONLY on the cover (first page / first slide). Never in    */
/*  body bullets, never repeated on later pages. This gives the agent  */
/*  a dedicated place for "put Group 1 + names on top" so it no longer */
/*  has to guess subtitle vs cover.points.                              */
/* ------------------------------------------------------------------ */

const membersList = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n+/) : [];
  const cleaned = (arr as unknown[])
    .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "").trim()))
    .filter(Boolean)
    .slice(0, 8);
  return cleaned.length ? cleaned : undefined;
}, z.array(z.string().max(80)).max(8).optional());

export const CoverHeaderSchema = z.object({
  group: z.preprocess((v) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v !== "string") return String(v);
    const t = v.trim();
    return t ? t.slice(0, 60) : undefined;
  }, z.string().max(60).optional()),
  members: membersList,
  subject: z.preprocess((v) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v !== "string") return String(v);
    const t = v.trim();
    return t ? t.slice(0, 60) : undefined;
  }, z.string().max(60).optional()),
  section: z.preprocess((v) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v !== "string") return String(v);
    const t = v.trim();
    return t ? t.slice(0, 60) : undefined;
  }, z.string().max(60).optional()),
});

export type CoverHeader = { group?: string; members?: string[]; subject?: string; section?: string };

export const OutlineSchema = z.object({
  title: str,
  subtitle: optStr,
  header: CoverHeaderSchema.optional(),
  format: formatEnum,
  docType: optStr,
  purpose: optStr,
  audience: optStr,
  tone: optStr,
  language: optStr,
  theme: themeEnum,
  pageSize: pageSizeEnum,
  targetLength: intCoerce,
  lengthSource: lengthSourceEnum.default("inferred"),
  requestedWords: requestedWordsCoerce,
  sections: z.array(OutlineSectionSchema).min(1),
  designNotes: optStr,
});

export type Outline = {
  title: string;
  subtitle?: string;
  /** Cover-only header: Group + member names. Rendered on cover only, never in body. */
  header?: CoverHeader;
  format: Format;
  docType: string;
  purpose?: string;
  audience?: string;
  tone?: string;
  language: string;
  theme: ThemeId;
  pageSize: PageSize;
  /** Slides for pptx, pages for docx/pdf. */
  targetLength: number;
  /** Whether the user explicitly asked for this length. */
  lengthSource: LengthSource;
  /** Exact word count the user asked for (e.g. 500), if any. Drives the writer budget + UI display. */
  requestedWords?: number;
  /** Industry-standard length for this document type (used by "Auto"). */
  suggestedLength: number;
  sections: OutlineSection[];
  designNotes?: string;
};

/* ------------------------------------------------------------------ */
/*  Agent response                                                      */
/* ------------------------------------------------------------------ */

export const QuestionSchema = z.object({
  id: optStr,
  question: str,
  options: strList.default([]),
  recommended: optStr,
  allowMultiple: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
  ui: z.preprocess(
    (v) => {
      if (typeof v !== "string") return undefined;
      const k = v.toLowerCase().trim().replace(/\s+/g, "-");
      if (["radio", "single", "single-select"].includes(k)) return "radio";
      if (["checkbox", "check", "multi", "multiple", "multiple-select"].includes(k)) return "checkbox";
      if (["text", "free", "open", "input"].includes(k)) return "text";
      if (["hybrid", "mixed", "both"].includes(k)) return "hybrid";
      return undefined;
    },
    z.enum(["radio", "checkbox", "text", "hybrid"]).optional(),
  ),
  placeholder: optStr,
});
export type Question = {
  id: string;
  question: string;
  options: string[];
  recommended?: string;
  allowMultiple: boolean;
  ui?: "radio" | "checkbox" | "text" | "hybrid";
  placeholder?: string;
};

export const AgentResponseSchema = z.preprocess(
  (v) => {
    if (!v || typeof v !== "object") return v;
    const o = { ...(v as Record<string, unknown>) };
    const kind = typeof o.kind === "string" ? o.kind.toLowerCase().trim() : undefined;
    if (kind === "questions" || kind === "clarification" || kind === "ask") o.kind = "clarify";
    else if (kind === "plan") o.kind = "outline";
    else if (kind === "message" || kind === "chat" || kind === "answer") o.kind = "reply";
    if (!o.kind) {
      if (o.outline) o.kind = "outline";
      else if (Array.isArray(o.questions) && o.questions.length) o.kind = "clarify";
      else o.kind = "reply";
    }
    if (o.kind === "outline" && !o.outline && Array.isArray(o.sections)) o.outline = { ...o };
    if (typeof o.message !== "string") o.message = o.message ? String(o.message) : "";
    return o;
  },
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("clarify"), message: z.string(), questions: z.array(QuestionSchema).min(1).max(5) }),
    z.object({ kind: z.literal("outline"), message: z.string(), outline: OutlineSchema }),
    z.object({ kind: z.literal("reply"), message: z.string() }),
  ]),
);

export type AgentResponse =
  | { kind: "clarify"; message: string; questions: Question[] }
  | { kind: "outline"; message: string; outline: Outline }
  | { kind: "reply"; message: string };

/* ------------------------------------------------------------------ */
/*  Stage 2 — Full document spec                                        */
/* ------------------------------------------------------------------ */

export const ColumnSchema = z.object({ heading: optStr, bullets: strList.default([]), body: optStr });
export const StatSchema = z.object({ value: str, label: str, description: optStr });
export const StepSchema = z.object({ label: str, description: optStr });
export const GroupSchema = z.object({ heading: str, meta: optStr, bullets: strList.default([]), body: optStr });

export const TableSchema = z.object({
  headers: strList.default([]),
  rows: z.preprocess((v) => {
    if (!Array.isArray(v)) return [];
    return v.map((row) => {
      if (Array.isArray(row)) return row.map((c) => (c === null || c === undefined ? "" : String(c)));
      if (row && typeof row === "object") return Object.values(row as Record<string, unknown>).map((c) => String(c ?? ""));
      return [String(row ?? "")];
    });
  }, z.array(z.array(z.string()))),
});

export const QuizQuestionSchema = z.object({
  question: str,
  options: strList.default([]),
  answer: optStr,
  answerIndex: z.preprocess((v) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }, z.number().int().min(0).max(10).optional()),
  explanation: optStr,
  type: z.preprocess((v) => {
    if (typeof v !== "string") return undefined;
    const k = v.toLowerCase().trim();
    if (["mcq", "multiple", "choice", "multiple-choice"].includes(k)) return "mcq";
    if (["tf", "truefalse", "true-false", "bool"].includes(k)) return "tf";
    if (["identification", "id", "short", "fill"].includes(k)) return "identification";
    return undefined;
  }, z.enum(["mcq", "tf", "identification"]).optional()),
});

export const BlockSchema = z.object({
  id: optStr,
  layout: layoutEnum,
  title: str,
  subtitle: optStr,
  body: optStr,
  bullets: strList.default([]),
  columns: z.array(ColumnSchema).optional(),
  stats: z.array(StatSchema).optional(),
  quote: z
    .preprocess((v) => {
      if (typeof v === "string") return { text: v };
      return v ?? undefined;
    }, z.object({ text: str, attribution: optStr }))
    .optional(),
  steps: z.array(StepSchema).optional(),
  groups: z.array(GroupSchema).optional(),
  table: TableSchema.optional(),
  quiz: z.array(QuizQuestionSchema).optional(),
  callout: optStr,
  notes: optStr,
});

export type Block = {
  id: string;
  layout: Layout;
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
  quiz?: { question: string; options: string[]; answer?: string; answerIndex?: number; explanation?: string; type?: "mcq" | "tf" | "identification" }[];
  callout?: string;
  notes?: string;
  /** Assigned by the design pass to alternate visual treatments. */
  variant?: number;
  /** Pagination hint: when true, this block prefers to start on a fresh page (honored when targetPages>1). */
  breakBefore?: boolean;
};

export const ExpandResponseSchema = z.preprocess((v) => {
  if (Array.isArray(v)) return { blocks: v };
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (!o.blocks && Array.isArray(o.sections)) return { blocks: o.sections };
    if (!o.blocks && Array.isArray(o.slides)) return { blocks: o.slides };
  }
  return v;
}, z.object({ blocks: z.array(BlockSchema).min(1) }));

export type FitInfo = {
  targetPages: number;
  pages: number;
  trimmed: number;
  fitted: boolean;
};

export type DocumentSpec = {
  title: string;
  subtitle?: string;
  /** Cover-only header: Group + member names. Rendered on cover only. */
  header?: CoverHeader;
  docType: string;
  purpose?: string;
  audience?: string;
  tone?: string;
  language: string;
  theme: ThemeId;
  pageSize: PageSize;
  /** Format the blocks were designed for. */
  format: Format;
  /** Origin format chosen by user — locks export options (pptx can only export pptx/pdf/img, etc.). */
  originFormat?: Format;
  /** Page budget for documents (undefined for decks). */
  targetPages?: number;
  /** Exact word count the user asked for, carried from the outline for display + budgets. */
  requestedWords?: number;
  /** ≤ 2 pages: inline header instead of a cover page, tighter rhythm. */
  compact?: boolean;
  /** Layout scale 0.6–1 chosen by the page-fit pass. */
  density?: number;
  fit?: FitInfo;
  author?: string;
  date?: string;
  blocks: Block[];
};

/* ------------------------------------------------------------------ */
/*  Shared client/server payload types                                  */
/* ------------------------------------------------------------------ */

export type Attachment = {
  id: string;
  name: string;
  size: number;
  kind: string;
  text: string;
  chars: number;
  pages?: number;
  status: "extracting" | "ready" | "error";
  error?: string;
  // Vision: image base64 for direct LLM vision (bypass text extraction)
  dataUrl?: string;
  mimeType?: string;
  isImage?: boolean;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentRequest = {
  messages: ChatTurn[];
  attachments?: { name: string; text: string; dataUrl?: string; mimeType?: string; isImage?: boolean }[];
  currentOutline?: Outline | null;
  preferredFormat?: Format | "auto";
};

export type ExpandRequest = {
  outline: Outline;
  transcript: ChatTurn[];
  attachments?: { name: string; text: string; dataUrl?: string; mimeType?: string; isImage?: boolean }[];
  /** Partial expand: only write these section ids, client merges into existing spec. */
  sectionIds?: string[];
};

export type RenderRequest = {
  spec: DocumentSpec;
  format: Format;
  /** Return a PDF twin of the requested format for on-screen preview. */
  preview?: boolean;
};
