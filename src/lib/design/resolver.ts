import type { ThemeId } from "@/lib/spec/types";
import { getTheme, THEMES, type Ornament, type BulletStyle } from "@/lib/spec/themes";

export type Mood = "warm" | "formal" | "cool" | "dark" | "playful" | "sage" | "minimal";
export type Anchor = "narrative" | "structured" | "assessment" | "form" | "one-pager" | "deck-lecture" | "deck-pitch" | "multi-part";

/** Resolved design decision — drives all renderers consistently. */
export type ResolvedDesign = {
  themeId: ThemeId;
  mood: Mood;
  anchor: Anchor;
  ornament: Ornament;
  bulletStyle: BulletStyle;
  /** True when a cover page is warranted (≥3p + docType needs it). */
  useCover: boolean;
  /** True when cursive display font is allowed on cover / headings. */
  allowCursive: boolean;
  /** Page bg override — normally theme.bg */
  bg: string;
};

const FORMAL_RE = /\b(resume|cv|curriculum|cover letter|letter|memo|business plan|proposal|report|executive|manual|certificate|invoice|contract|sop|policy|paper|thesis|dissertation|research)\b/i;
const PLAYFUL_RE = /\b(kids|children|creative|marketing|playful|fun|party|event|birthday|community|lifestyle|planner playful)\b/i;
const SAGE_RE = /\b(planner|weekly|study planner|timetable|checklist)\b/i;
const COOL_RE = /\b(science|tech|engineering|ai|software|cool|blue|physics|chemistry|math)\b/i;
const DARK_RE = /\b(dark|black|midnight|noir|night|premium|luxury)\b/i;

/* Explicit style adjectives from the user (e.g. "beautiful modern resume").
   Deterministic like everything else here — the free-tier model is never trusted. */
const STYLE_PLAYFUL_RE = /\b(beautiful|aesthetic|aesthetics|stunning|gorgeous|vibrant|colorful|colourful)\b/i;
const STYLE_MINIMAL_RE = /\b(minimal|clean|simple|plain|neat)\b/i;
const STYLE_MODERN_RE = /\b(modern|contemporary|sleek)\b/i;
const STYLE_ELEGANT_RE = /\b(elegant|sophisticated|classy)\b/i;

const ASSESSMENT_RE = /\b(quiz|worksheet|test|exam|assessment|review sheet|questionnaire|rubric)\b/i;
const FORM_RE = /\b(planner|schedule|timetable|calendar|checklist|tracker|weekly)\b/i;
const ONE_PAGER_RE = /\b(one[- ]?pager|fact ?sheet|cheat ?sheet|flyer|summary|handout|overview)\b/i;
const STUDY_RE = /\b(study guide|study notes|outline|lecture notes|study session|book report)\b/i;
const ESSAY_RE = /\b(essay|comparative|reflection|analysis|review|article|reflection)\b/i;

/* Canvas BG contract (ruling: formal = pure white, mood decides the rest):
   formal → white themes only (slate default, executive for business/finance,
   academic kept for long scholarly works where serif aids readability);
   school/creative default → warm paper; tech → cool; explicit dark → noir/midnight. */
function detectMood(text: string, tone?: string): Mood {
  const t = `${text} ${tone ?? ""}`.toLowerCase();
  if (DARK_RE.test(t) || /\bnoir\b/.test(t)) return "dark";
  // Explicit style adjectives beat the formal default ("beautiful resume" → playful).
  if (STYLE_PLAYFUL_RE.test(t)) return "playful";
  if (PLAYFUL_RE.test(t) || /\b(coral|plum|playful|creative|fun)\b/.test(t)) return "playful";
  if (STYLE_MINIMAL_RE.test(t)) return "minimal";
  if (STYLE_ELEGANT_RE.test(t)) return "formal";
  if (STYLE_MODERN_RE.test(t)) return "cool";
  if (SAGE_RE.test(t) && !FORMAL_RE.test(t) && !COOL_RE.test(t)) return "sage";
  if (COOL_RE.test(t)) return "cool";
  if (FORMAL_RE.test(t)) return "formal";
  if (ESSAY_RE.test(t) || STUDY_RE.test(t) || /\b(part a|part b|comparative|divine|revelation|history|literature|humanities)\b/.test(t)) return "warm";
  if (/\b(cream|paper|editorial)\b/.test(t)) return "warm";
  // Default for student/teacher: warm paper beats cold white
  return "warm";
}

function detectAnchor(docType: string, format: string): Anchor {
  const d = docType.toLowerCase();
  if (format === "pptx") {
    if (/\b(pitch|deck|presentation|pitch deck|business plan)\b/.test(d)) return "deck-pitch";
    return "deck-lecture";
  }
  if (ASSESSMENT_RE.test(d)) return "assessment";
  if (FORM_RE.test(d)) return "form";
  if (ONE_PAGER_RE.test(d)) return "one-pager";
  if (STUDY_RE.test(d)) return "structured";
  if (/\bpart [ab]|multi[- ]?part\b/.test(d)) return "multi-part";
  if (ESSAY_RE.test(d)) return "narrative";
  // Fallback by common teaching types
  if (/\b(research|report|proposal|paper)\b/.test(d)) return "narrative";
  if (/\b(planner|schedule|checklist)\b/.test(d)) return "form";
  return "narrative";
}

function moodToTheme(mood: Mood, docType: string, tone?: string, format?: string, audience?: string): ThemeId {
  const d = docType.toLowerCase();
  const t = (tone ?? "").toLowerCase();
  const a = (audience ?? "").toLowerCase();
  // Explicit dark request
  if (mood === "dark") {
    if (/\b(tech|ai|midnight)\b/.test(d + " " + t)) return "midnight";
    return "noir";
  }
  if (mood === "cool") return "cool";
  if (mood === "warm") return "warm";
  if (mood === "sage") return "forest";
  if (mood === "playful") return d.includes("planner") ? "forest" : "coral";
  if (mood === "formal") {
    // Long scholarly works keep serif readability; everything else formal is pure white.
    if (/\bresearch|thesis|dissertation\b/.test(d)) return "academic";
    if (/\b(finance|board|consulting|executive|executives)\b/.test(d + " " + t + " " + a)) return "executive";
    if (/\b(elegant|sophisticated|classy)\b/.test(t)) return "executive";
    // For pptx, never return pure white mono — use warm instead for editorial but with pptx cover structure
    if (format === "pptx") return "warm";
    return "slate";
  }
  if (mood === "minimal") {
    // Ban pure white for pptx — use warm paper instead
    if (format === "pptx") return "warm";
    return "mono";
  }
  return "warm";
}

export function resolveDesign(opts: {
  docType: string;
  tone?: string;
  audience?: string;
  targetPages?: number;
  compact?: boolean;
  preferredTheme?: ThemeId;
  format?: import("@/lib/spec/types").Format;
}): ResolvedDesign {
  const text = `${opts.docType} ${opts.audience ?? ""}`;
  const mood = detectMood(text, opts.tone);
  const fmt = opts.format ?? "pdf";
  // Treat "mono" as auto — allow mood to pick warm/cool/noir etc. Only non-mono explicit themes are honored.
  const isExplicit = !!opts.preferredTheme && opts.preferredTheme !== "mono" && opts.preferredTheme in THEMES;
  let themeId = isExplicit ? opts.preferredTheme! : moodToTheme(mood, opts.docType, opts.tone, fmt, opts.audience);
  // Hard ban: PPTX never pure white mono — warm/cool/dark only
  if (fmt === "pptx" && themeId === "mono") themeId = "warm";
  const theme = getTheme(themeId);
  const anchor = detectAnchor(opts.docType, fmt);
  // Docs: never cover (stripped per last spec), PPTX: always cover slide
  const useCover = fmt === "pptx" ? true : false;

  // Cursive/display: only when mood is playful, or warm + planner/certificate/poster/creative + not formal
  const isPlayfulTone = /\b(playful|creative|fun|handwritten|cursive)\b/i.test(opts.tone ?? "");
  const isPlannerLike = /\b(planner|certificate|poster|invitation|weekly|study planner)\b/i.test(opts.docType);
  const allowCursive = mood !== "formal" && (mood === "playful" || isPlayfulTone || (mood === "warm" && isPlannerLike) || (mood === "sage" && isPlannerLike));

  return {
    themeId,
    mood,
    anchor,
    ornament: theme.ornament,
    bulletStyle: theme.bulletStyle,
    useCover,
    allowCursive,
    bg: theme.colors.bg,
  };
}

/** Pptx-specific anchor — deck type inferred from docType */
export function anchorForDeck(docType: string): Anchor {
  return detectAnchor(docType, "pptx");
}
