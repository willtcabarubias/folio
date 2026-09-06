import { parseRequestedWords } from "@/lib/spec/normalize";

/* ------------------------------------------------------------------ */
/*  Deterministic understanding score (0-100)                           */
/*                                                                      */
/*  The free-tier model cannot be trusted to judge its own understanding, */
/*  so the gate is computed in code from observable signals. Below       */
/*  CONFIDENCE_THRESHOLD the planner MUST clarify in one turn instead of */
/*  hallucinating a document.                                           */
/* ------------------------------------------------------------------ */

export const CONFIDENCE_THRESHOLD = 70;

export type Confidence = {
  score: number;
  missingFormat: boolean;
  missingLength: boolean;
  isVague: boolean;
  reasons: string[];
  /** Unique topic substance count (format/length keywords excluded). */
  topicCount: number;
  /** Non-empty focus/substantive answers already given (server-parsed). */
  focusAnswered: boolean;
};

const FORMAT_KEYWORDS = /\b(pdf|pptx|docx|slides?|deck|presentation|powerpoint|word|document)\b/i;
// Tier answers like "Detailed (6+ pages)" and ranges like "10-12 slides" count.
const PAGES_SLIDES = /(\d+)\s*\+?\s*(pages?|slides?)\b|(\d+)\s*-\s*(page|slide)\b/i;
const GREETING_ONLY = /^(hi|hello|hey|yo|sup|howdy|greetings|good (morning|afternoon|evening))[\s!.,]*$/i;
const VAGUE_PHRASES = /\b(explain this|what is this|what['’]s this|describe this|make something|do this|something|stuff|things?|help(\s+me)?(\s+with(\s+school)?)?|that file|this file|school work|assignment)\b/i;
const FILLER = new Set([
  "i", "want", "to", "make", "me", "a", "an", "the", "please", "pls", "can", "you", "u", "please",
  "for", "with", "from", "about", "on", "my", "our", "this", "that", "it", "is", "are", "be",
  "and", "or", "of", "in", "at", "just", "so", "do", "hi", "hello", "hey", "thanks", "thank",
]);

/** Content-bearing words after stripping greetings/fillers/punctuation. */
export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !FILLER.has(w));
}

export function computeConfidence(opts: {
  userText: string;
  lastUserText: string;
  preferredFormat?: string;
  hasAttachments: boolean;
  /** Deterministically parsed prior answers (server transcript memory). */
  answeredFormat?: string | null;
  answeredLength?: string | null;
  answeredSubstantive?: number;
}): Confidence {
  const { userText, lastUserText, preferredFormat, hasAttachments } = opts;
  const answeredFormat = (opts.answeredFormat ?? "").trim();
  const answeredLength = (opts.answeredLength ?? "").trim();
  const answeredSubstantive = opts.answeredSubstantive ?? 0;
  const reasons: string[] = [];
  let score = 0;

  // 1. Topic specificity (0-40): unique content words across the whole thread.
  const words = new Set(contentWords(userText));
  // Format/length keywords are not topic substance — exclude them from the count.
  for (const w of [...words]) {
    if (/^(pdf|pptx|docx|slides?|deck|pages?|words?|characters?|chars?)$/.test(w)) words.delete(w);
  }
  const digits = (userText.match(/\d+/g) ?? []).length;
  const topicCount = words.size + Math.min(2, digits);
  if (topicCount >= 12) score += 40;
  else if (topicCount >= 8) score += 30;
  else if (topicCount >= 5) score += 20;
  else if (topicCount >= 3) score += 10;
  reasons.push(`topic:${topicCount}`);

  // 2. Format explicit (0-20): pill, keyword, or an already-given answer.
  const formatExplicit =
    (preferredFormat != null && preferredFormat !== "auto") || FORMAT_KEYWORDS.test(userText) || answeredFormat.length > 0;
  if (formatExplicit) score += 20;
  else reasons.push("format:missing");

  // 3. Length explicit (0-20): pages/slides numbers, words/chars counts,
  // tier labels ("Detailed (6+ pages)"), or an already-given answer.
  const lengthExplicit = PAGES_SLIDES.test(userText) || parseRequestedWords(userText) !== null || answeredLength.length > 0;
  if (lengthExplicit) score += 20;
  else reasons.push("length:missing");

  // 4. Attachment context bonus (+10, capped).
  if (hasAttachments) {
    score += 10;
    reasons.push("attachments:+10");
  }

  // 5. Completeness bonus (+15): explicit format AND length means the task is
  // actionable even with a short topic — a complete request must not clarify.
  if (formatExplicit && lengthExplicit) {
    score += 15;
    reasons.push("complete:+15");
  }

  // 6. Vague-phrase penalty (-15 each, cap -30).
  const vagueHits = lastUserText.toLowerCase().match(
    /\b(explain this|what is this|describe this|make something|do this|something|stuff|things?|that file|this file)\b/g,
  );
  const helpVague = /\bhelp(\s+me)?(\s+with(\s+school|\s+homework|\s+assignment)?)?\s*[!?.]*$/i.test(lastUserText.trim()) && contentWords(lastUserText).length < 4;
  const penalty = Math.min(30, (vagueHits?.length ?? 0) * 15 + (helpVague ? 15 : 0));
  if (penalty > 0) {
    score -= penalty;
    reasons.push(`vague:-${penalty}`);
  }

  // 7. Greeting-only hard cap: "hi" is never an understood task.
  if (GREETING_ONLY.test(lastUserText.trim()) || (contentWords(lastUserText).length === 0 && contentWords(userText).length === 0)) {
    score = Math.min(score, 15);
    reasons.push("greeting:cap15");
  }

  // Answered substance counts toward understanding (bounded): each answered
  // focus/substantive dimension proves the task is getting nailed down.
  if (answeredSubstantive > 0) {
    const bonus = Math.min(10, answeredSubstantive * 5);
    score += bonus;
    reasons.push(`answered:+${bonus}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const missingFormat = !formatExplicit;
  const missingLength = !lengthExplicit;
  const focusAnswered = answeredSubstantive > 0;
  return { score, missingFormat, missingLength, isVague: score < CONFIDENCE_THRESHOLD, reasons, topicCount, focusAnswered };
}
