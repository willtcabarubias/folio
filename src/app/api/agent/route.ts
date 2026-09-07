import { NextResponse } from "next/server";
import { AIError, MISSING_KEY_MESSAGE, generateStructured, isConfigured, type ChatMessage } from "@/lib/ai/client";
import { MAX_CLARIFY_ROUNDS, THEME_UNSUPPORTED_MESSAGE, agentSystemPrompt, attachmentsToPromptText, hasContentRequest, isThemeChangeRequest } from "@/lib/ai/prompts";
import { CONFIDENCE_THRESHOLD, computeConfidence } from "@/lib/ai/confidence";
import { normalizeOutline, parseRequestedWords, sanitizeChatMessage } from "@/lib/spec/normalize";
import { extractCoverHeader, headerToPromptText, isRemakeRequest, mergeHeader } from "@/lib/spec/intent";
import { explicitRemovalTitles, mergeOutlinePreserving } from "@/lib/spec/patch";
import { applyTemplateSkeleton, matchTemplate, templateBrief, type DocTemplate } from "@/lib/spec/templates";
import { AgentResponseSchema, type AgentRequest, type AgentResponse, type Format, type Question } from "@/lib/spec/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ATTACHMENT_BUDGET = 60_000;

/* ------------------------------------------------------------------ */
/*  Transcript memory: never re-ask an answered dimension               */
/*                                                                      */
/*  The free-tier model re-emits format/length questions even after the */
/*  user answered them, so asked/answered state is reconstructed here   */
/*  deterministically from history instead of trusting the model.       */
/* ------------------------------------------------------------------ */

export type AskedAnswered = {
  askedFormat: boolean;
  askedLength: boolean;
  answeredFormat: string | null;
  answeredLength: string | null;
  /** Normalized substantive question texts with a non-empty answer. */
  answeredNormQ: Set<string>;
  /** Count of answered substantive dimensions (focus/topic/angle/...). */
  answeredSubstantive: number;
};

function normQText(s: string): string {
  return sanitizeChatMessage(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function jaccard(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Bucket a question the same way finalize() does (id first, text fallback). */
function bucketOf(q: { id?: unknown; question?: unknown; options?: unknown }): "format" | "length" | "substantive" {
  const id = typeof q.id === "string" ? q.id.trim().toLowerCase() : "";
  const text = `${id} ${typeof q.question === "string" ? q.question : ""}`.toLowerCase();
  if (id === "format" || (/which format|format\?/.test(text) && /pdf|pptx|docx/.test(text))) return "format";
  if (id === "length" || /how many slides|how long\?|pages\?|slides\?/.test(text)) return "length";
  return "substantive";
}

type AskedRound = { index: number; questions: { id: string; question: string; recommended?: string; options: string[] }[] };

function parseAskedRounds(messages: { role: string; content: string }[]): AskedRound[] {
  const rounds: AskedRound[] = [];
  messages.forEach((m, index) => {
    if (m.role !== "assistant" || !/"kind"\s*:\s*"clarify"/.test(m.content)) return;
    try {
      const parsed = JSON.parse(m.content) as { questions?: { id?: string; question?: string; recommended?: string; options?: string[] }[] };
      if (!Array.isArray(parsed.questions)) return;
      rounds.push({
        index,
        questions: parsed.questions.map((q, i) => ({
          id: typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q${i + 1}`,
          question: typeof q.question === "string" ? q.question : "",
          recommended: typeof q.recommended === "string" ? q.recommended : undefined,
          options: Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === "string") : [],
        })),
      });
    } catch {
      /* not machine JSON (e.g. prose echo) — ignore */
    }
  });
  return rounds;
}

/** Split a "My answers:" user turn into per-question {question, answer} pairs. */
function parseAnswerLines(content: string): { question: string; answer: string }[] {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines[0]?.toLowerCase().startsWith("my answers:")) return [];
  const out: { question: string; answer: string }[] = [];
  for (const line of lines.slice(1)) {
    const cleaned = line.replace(/^[•\-*]\s*/, "");
    const sep = cleaned.search(/(→|->|:)/);
    if (sep < 0) continue;
    const rawAnswer = cleaned.slice(sep + (cleaned.startsWith("->", sep) ? 2 : 1));
    out.push({ question: cleaned.slice(0, sep).trim(), answer: rawAnswer.replace(/^\s*(->|→|:|-)\s*/, "").trim() });
  }
  return out;
}

export function extractAskedAnswered(messages: { role: string; content: string }[]): AskedAnswered {
  const empty: AskedAnswered = {
    askedFormat: false, askedLength: false,
    answeredFormat: null, answeredLength: null,
    answeredNormQ: new Set(), answeredSubstantive: 0,
  };
  const rounds = parseAskedRounds(messages);
  if (!rounds.length) return empty;
  for (const r of rounds) {
    for (const q of r.questions) {
      const b = bucketOf(q);
      if (b === "format") empty.askedFormat = true;
      else if (b === "length") empty.askedLength = true;
    }
  }
  const claim = (roundIdx: number, qi: number, answer: string) => {
    const round = rounds[roundIdx];
    const q = round?.questions[qi];
    const text = answer.trim();
    if (!q || !text) return;
    const b = bucketOf(q);
    if (b === "format") empty.answeredFormat = text;
    else if (b === "length") empty.answeredLength = text;
    else {
      empty.answeredNormQ.add(normQText(q.question));
      empty.answeredSubstantive += 1;
    }
  };
  messages.forEach((m, i) => {
    if (m.role !== "user") return;
    // Whole-round skip: every question of the most recent prior round counts answered.
    if (/^\s*Use the recommended options and go ahead with the outline\./i.test(m.content.trim())) {
      const prior = [...rounds].reverse().find((r) => r.index < i);
      prior?.questions.forEach((q, qi) => {
        const roundIdx = rounds.indexOf(prior);
        claim(roundIdx, qi, q.recommended || q.options[0] || "recommended");
      });
      return;
    }
    const pairs = parseAnswerLines(m.content);
    if (!pairs.length) return;
    const prior = [...rounds].reverse().find((r) => r.index < i);
    if (!prior) return;
    const roundIdx = rounds.indexOf(prior);
    pairs.forEach((p, pi) => {
      // Positional anchor first (answers echo questions in order), text match fallback.
      const byIndex = prior.questions[pi];
      const byText = prior.questions.find((q) => normQText(q.question) && normQText(q.question) === normQText(p.question));
      const target = byIndex && normQText(byIndex.question) === normQText(p.question) ? byIndex : byText ?? byIndex;
      const qi = target ? prior.questions.indexOf(target) : pi;
      claim(roundIdx, qi, p.answer);
    });
  });
  return empty;
}

const REVISION_VERBS = /\b(change|switch|convert|make it|use|instead|rather|redo|turn (it )?into|regenerate as)\b/i;

/** Last-turn revision ("change format to docx") exempts that bucket from suppression. */
function isFormatRevision(text: string): boolean {
  return REVISION_VERBS.test(text) && /\b(pdf|pptx|docx|slides?|word|document|deck|presentation)\b/i.test(text);
}
function isLengthRevision(text: string): boolean {
  return (
    REVISION_VERBS.test(text) &&
    (/(\d+)\s*\+?\s*(pages?|slides?)\b/i.test(text) || /\b(longer|shorter)\b/i.test(text) || parseRequestedWords(text) !== null)
  );
}

export async function POST(req: Request) {
  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && typeof m.content === "string" && m.content.trim()) : [];
  if (!messages.length) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  if (!isConfigured()) return NextResponse.json({ error: MISSING_KEY_MESSAGE, code: "missing_key" }, { status: 500 });

  // Design changes (background/theme/colors) are unsupported: answer deterministically
  // without spending an LLM call, and never claim one was applied.
  const lastUserForTheme = messages[messages.length - 1]?.content ?? "";
  const themeIntent = isThemeChangeRequest(lastUserForTheme);
  const contentIntent = hasContentRequest(lastUserForTheme);
  if (themeIntent && !contentIntent) {
    return NextResponse.json({ kind: "reply", message: THEME_UNSUPPORTED_MESSAGE });
  }

  const attachments = (body.attachments ?? []).filter((a) => a && (a.text?.trim() || (a as any).isImage)).slice(0, 8);
  const clarifyRounds = messages.filter((m) => m.role === "assistant" && /"kind"\s*:\s*"clarify"/.test(m.content)).length;
  const hasOutline = Boolean(body.currentOutline);

  // Deterministic understanding gate (never trust the model to judge itself).
  // Transcript memory: what was already asked + answered (never re-ask it).
  const askedAnswered = body.currentOutline ? null : extractAskedAnswered(messages);
  const userText = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const parsedWords = parseRequestedWords(userText);
  const confidence = computeConfidence({
    userText,
    lastUserText: messages[messages.length - 1]?.content ?? "",
    preferredFormat: body.preferredFormat,
    hasAttachments: attachments.length > 0,
    answeredFormat: askedAnswered?.answeredFormat,
    answeredLength: askedAnswered?.answeredLength,
    answeredSubstantive: askedAnswered?.answeredSubstantive ?? 0,
  });
  const answeredSummary = askedAnswered
    ? [
        askedAnswered.answeredFormat ? `format → ${askedAnswered.answeredFormat}` : "",
        askedAnswered.answeredLength ? `length → ${askedAnswered.answeredLength}` : "",
        askedAnswered.answeredSubstantive > 0 ? `focus/substantive dimensions answered: ${askedAnswered.answeredSubstantive}` : "",
      ]
        .filter(Boolean)
        .join("; ")
    : "";

  const system = agentSystemPrompt({
    clarifyRounds,
    hasAttachments: attachments.length > 0,
    preferredFormat: body.preferredFormat,
    hasOutline,
    confidence: hasOutline ? undefined : { ...confidence },
    answeredSummary: answeredSummary || undefined,
  });

  const convo: ChatMessage[] = messages.slice(-16).map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }));

  // Context block goes right before the latest user message so it stays salient.
  const contextParts: string[] = [];
  // School template match: seed the planner with the expected section flow.
  // Skipped when the user already has an outline (their edits are source of truth).
  const template: DocTemplate | null = body.currentOutline ? null : matchTemplate(messages.filter((m) => m.role === "user").map((m) => m.content).join("\n"));
  if (template) contextParts.push(templateBrief(template));
  // For vision, keep text attachments in prompt text; images will be sent as vision parts (no base64 in text)
  const textAtts = attachments.filter((a) => !(a as any).isImage);
  const imageAtts = attachments.filter((a) => (a as any).isImage && (a as any).dataUrl);
  if (textAtts.length) contextParts.push(`Attached source material:\n${attachmentsToPromptText(textAtts as any, ATTACHMENT_BUDGET)}`);
  if (imageAtts.length) contextParts.push(`Images attached (${imageAtts.length}): ${imageAtts.map((a) => a.name).join(", ")} — use vision to describe/OCR if needed.`);
  if (body.currentOutline) contextParts.push(`Current outline (source of truth, may include the user's manual edits):\n${JSON.stringify(body.currentOutline)}`);
  // Sticky cover header: survives truncation — the model must keep it on the cover.
  try {
    const sticky = headerToPromptText(body.currentOutline?.header) || headerToPromptText(extractCoverHeader(messages[messages.length - 1]?.content ?? ""));
    if (sticky && body.currentOutline) contextParts.push(sticky);
  } catch {
    /* sticky header is best-effort */
  }
  if (contextParts.length) {
    const lastUser = convo.length - 1;
    convo[lastUser] = { role: "user", content: `${contextParts.join("\n\n")}\n\n---\nUser message:\n${(convo[lastUser].content as string)}` };
  }
  // If any images, convert last user message to multimodal (text + image_url) for vision models (Zen muse-spark)
  if (imageAtts.length) {
    const lastIdx = convo.length - 1;
    const last = convo[lastIdx];
    const txt = typeof last.content === "string" ? last.content : JSON.stringify(last.content);
    const parts: any[] = [{ type: "text", text: txt }];
    for (const img of imageAtts.slice(0, 4)) {
      parts.push({ type: "image_url", image_url: { url: (img as any).dataUrl } });
    }
    (convo as any)[lastIdx] = { role: last.role, content: parts };
  }

  try {
    // Bulletproof: cap extra LLM calls to stay under Vercel/Hobby timeouts.
    // Planner (1) + max 2 repairs. Previously up to 5 sequential calls could 504.
    let extraCalls = 0;
    const canRetry = () => extraCalls < 2;
    const doRetry = async (messages: ChatMessage[], label: string) => {
      extraCalls++;
      return generateStructured({
        schema: AgentResponseSchema,
        system,
        messages,
        maxTokens: 6000,
        temperature: 0.4,
        label,
      });
    };

    let result = await generateStructured({
      schema: AgentResponseSchema,
      system,
      messages: convo,
      maxTokens: 6000,
      temperature: 0.5,
      label: "Planner",
    });

    // Hard guarantee: no endless questioning.
    if (result.kind === "clarify" && clarifyRounds >= MAX_CLARIFY_ROUNDS) {
      result = await doRetry(
        [...convo, { role: "user", content: "Do not ask more questions. Produce the outline now with sensible defaults." }],
        "Planner",
      );
    }

    // Guard: vague file tasks must not be answered inline — force clarify with stepper UI.
    // Business rule: we are a document generator, not ChatGPT — "explain this" with a file must become a document, not an inline chat answer.
    // Tightened: require explicit file-task phrasing to avoid over-matching generic "help".
    const lastUserRaw = messages[messages.length - 1]?.content ?? "";
    const isVagueFileTask =
      attachments.length > 0 &&
      /summar|summry|explain\s+(this|that|it|the)|describe\s+(this|that|it)|what.*(is|does|say).*this|tell.*about (this|that|it)|identify.*(wrong|issue)|what.*wrong|what.*issue|critique|review this|extract|find.*(wrong|issue|error|problem)|\bmake\s+something\b|\bpl[sz]?\s+make\b/i.test(lastUserRaw);
    const isGenericExplainReply =
      attachments.length > 0 &&
      result.kind === "reply" &&
      /happy to help|what would you like me to explain|let me know.*explain|paste the content here/i.test((result as { message: string }).message ?? "");
    if (canRetry() && ((result.kind === "reply" && isVagueFileTask) || isGenericExplainReply)) {
      result = await doRetry(
        [
          ...convo,
          {
            role: "user",
            content:
              "Your last answer was an inline reply, but the user attached a file and asked a vague file task (summarize / explain this / describe what this is / identify what's wrong / critique / review). You MUST return kind \"clarify\" with 1-2 questions (Q1 focus: Whole document | Key concepts | Section breakdown | Actionable takeaways [ui hybrid, placeholder \"e.g., key concepts\"], Q2 format: Explainer 2-4 pages PDF [Rec] | Study guide | Slide deck [ui radio]) and do NOT explain the file inline. We are a document generator — convert the request into a file. Keep questions few when task is clear.",
          },
        ],
        "Planner-retry-file-task",
      );
    }

    // Mixed request (content + theme tweak): content flows normally, but the model
    // must not claim the design part was applied. Catch the hallucinated "Done".
    if (themeIntent && contentIntent && result.kind === "reply") {
      const msg = (result as { message: string }).message ?? "";
      if (/done.{0,60}(background|theme|dark|color|colour)|updated the background|changed.{0,30}to dark|redesign.{0,30}(done|complete)/i.test(msg)) {
        result = { kind: "reply", message: THEME_UNSUPPORTED_MESSAGE } as typeof result;
      }
    }
    // Hard gate (inverse of the force-outline above): missing format/length, or a
    // thin topic with no focus answered yet, must clarify in ONE turn — never
    // hallucinate a file. A low score alone no longer forces repeats once every
    // dimension is answered (that loop caused re-asked questions).
    const mustClarify =
      !hasOutline &&
      clarifyRounds < MAX_CLARIFY_ROUNDS &&
      (confidence.missingFormat ||
        confidence.missingLength ||
        (confidence.score < CONFIDENCE_THRESHOLD && confidence.topicCount < 3 && !confidence.focusAnswered));
    if (canRetry() && mustClarify && result.kind === "outline") {
      const need: string[] = [];
      if (confidence.score < CONFIDENCE_THRESHOLD && confidence.topicCount < 3 && !confidence.focusAnswered)
        need.push(`understanding is only ${confidence.score}/100 with a thin topic`);
      if (confidence.missingFormat) need.push("format not stated");
      if (confidence.missingLength) need.push("length not stated");
      result = await doRetry(
        [
          ...convo,
          {
            role: "user",
            content: `Do NOT produce an outline yet (${need.join("; ")}). Return kind "clarify" in ONE single turn: substantive focus question(s) first (hybrid with write-your-own placeholder), then the missing format question (second-last) and/or length question (absolute last) as needed, max 4 total. JSON only.`,
          },
        ],
        "Planner-force-clarify",
      );
    }
    let response = finalize(result, body.preferredFormat, parsedWords, template, askedAnswered, lastUserRaw, body.currentOutline ?? null);
    // Suppression consumed every question: the model only repeated answered
    // dimensions. Force the outline (bounded, same pattern as the MAX path) —
    // never stall on the "tell me more" reply fallback.
    if (
      canRetry() &&
      result.kind === "clarify" &&
      response.kind === "reply" &&
      askedAnswered &&
      (askedAnswered.answeredFormat || askedAnswered.answeredLength || askedAnswered.answeredNormQ.size > 0)
    ) {
      result = await doRetry(
        [
          ...convo,
          {
            role: "user",
            content:
              "All needed answers were already given (see My answers in history). Do not ask more questions. Produce the outline now with sensible defaults, honoring the answered format and length.",
          },
        ],
        "Planner-suppression-empty",
      );
      response = finalize(result, body.preferredFormat, parsedWords, template, null, lastUserRaw, body.currentOutline ?? null);
    }
    if (themeIntent && contentIntent && response.kind === "outline") {
      response = { ...response, message: `${response.message} (Note: background/theme changes aren't supported yet — content updates applied.)` };
    }
    // Cover-only guard: retry once instead of silently returning a header-only doc.
    // Applies to explicit AND inferred lengths — a cover with zero content sections is never valid.
    if (canRetry() && response.kind === "outline") {
      const contentSections = response.outline.sections.filter((s) => s.layout !== "cover" && s.layout !== "agenda").length;
      if (contentSections === 0) {
        const retry = await doRetry(
          [
            ...convo,
            { role: "assistant", content: JSON.stringify(result).slice(0, 12000) },
            {
              role: "user",
              content: `Your outline has only a cover and no content sections, but the user explicitly asked for ${response.outline.requestedWords ? `${response.outline.requestedWords} words (${response.outline.targetLength} pages)` : `${response.outline.targetLength} ${response.outline.format === "pptx" ? "slides" : "pages"}`}. Return the FULL corrected outline JSON now with at least ${Math.max(4, Math.min(response.outline.targetLength * 2, 7))} sections (cover first, then content sections, then closing where the type calls for it), keeping the same title/format. No commentary, JSON only.`,
            },
          ],
          "Planner-repair-cover-only",
        );
        response = finalize(retry, body.preferredFormat, parsedWords, template, askedAnswered, lastUserRaw, body.currentOutline ?? null);
      }
    }
    return NextResponse.json(response);
  } catch (err) {
    const status = err instanceof AIError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[agent]", message, stack);
    return NextResponse.json({ error: message, details: stack?.slice(0, 3000), stack: stack?.slice(0, 4000) }, { status });
  }
}

export function finalize(
  result: unknown,
  preferred?: Format | "auto",
  parsedWords?: { words: number; pages: number } | null,
  template?: DocTemplate | null,
  askedAnswered?: AskedAnswered | null,
  lastUserText?: string,
  currentOutline?: import("@/lib/spec/types").Outline | null,
): AgentResponse {
  const r = result as { kind: string; message: string; questions?: unknown[]; outline?: unknown };
  if (r.kind === "clarify") {
    let questions = (r.questions as { id?: string; question: string; options: string[]; recommended?: string; allowMultiple: boolean; ui?: string; placeholder?: string }[])
      .map((q, i): Question => {
        const options = dedupe(q.options.map((o) => sanitizeChatMessage(o)).filter(Boolean)).slice(0, 6);
        const recommended = q.recommended && options.includes(sanitizeChatMessage(q.recommended)) ? sanitizeChatMessage(q.recommended) : options[0];
        const uiRaw = typeof q.ui === "string" ? q.ui.toLowerCase().trim() : undefined;
        const ui = uiRaw === "radio" || uiRaw === "checkbox" || uiRaw === "text" || uiRaw === "hybrid" ? (uiRaw as Question["ui"]) : undefined;
        // infer ui from allowMultiple when not provided: multi → checkbox, single+options→ hybrid (options + Other field), no options→ text
        let inferredUi: Question["ui"] = ui ?? (options.length === 0 ? "text" : q.allowMultiple ? "checkbox" : "hybrid");
        // Shaping questions must always offer write-your-own: substantive singles
        // are never pure radio (format/length/checkbox-multi keep their ui).
        const qid = (q.id ?? "").trim().toLowerCase();
        if (qid !== "format" && qid !== "length" && !q.allowMultiple && options.length > 0) inferredUi = "hybrid";
        return { id: q.id?.trim() || `q${i + 1}`, question: sanitizeChatMessage(q.question), options, recommended, allowMultiple: q.allowMultiple, ui: inferredUi, placeholder: typeof q.placeholder === "string" && q.placeholder.trim() ? sanitizeChatMessage(q.placeholder).slice(0, 80) || undefined : undefined };
      })
      .filter((q) => q.question);
    // Reorder: substantive first, format/length last (length absolute last) — UX: pages/decks question will be last
    const isFormatQ = (q: Question) => {
      const text = `${q.id} ${q.question} ${q.options.join(" ")}`.toLowerCase();
      return q.id === "format" || (/which format|format\?/.test(text) && /pdf|pptx|docx/.test(text));
    };
    const isLengthQ = (q: Question) => {
      const text = `${q.id} ${q.question}`.toLowerCase();
      return q.id === "length" || /how many slides|how long\?|pages\?|slides\?/.test(text);
    };
    const substantive = questions.filter((q) => !isFormatQ(q) && !isLengthQ(q));
    const formats = questions.filter(isFormatQ);
    const lengths = questions.filter(isLengthQ);
    questions = [...substantive, ...formats, ...lengths];
    // Length questions must offer a real choice: degenerate single-option sets
    // (e.g. invoice → ["1 page"]) get tiered defaults so the stepper/custom
    // field always has short / standard / detailed to work with.
    const tierDefaults = (q: Question): { options: string[]; placeholder: string } => {
      const text = `${q.question} ${q.options.join(" ")}`.toLowerCase();
      const slides = preferred === "pptx" || /slide/.test(text);
      return slides
        ? { options: ["Short (5-6 slides)", "Standard (10-12 slides)", "Detailed (18-20 slides)"], placeholder: "e.g., 12 slides" }
        : { options: ["Short (1 page)", "Standard (2-4 pages)", "Detailed (6+ pages)"], placeholder: "e.g., 5 pages" };
    };
    questions = questions.map((q) => {
      if (!isLengthQ(q) || q.options.length >= 2) return q;
      const d = tierDefaults(q);
      return { ...q, options: d.options, recommended: d.options[1], placeholder: q.placeholder ?? d.placeholder };
    });
    // Hardening: if preferredFormat is already fixed (quick-start or user stated), strip any hallucinated format question (prod bug: double-ask)
    if (preferred && preferred !== "auto") {
      const before = questions.length;
      questions = questions.filter((q) => {
        const text = `${q.id} ${q.question} ${q.options.join(" ")}`.toLowerCase();
        const isFQ = q.id === "format" || (/which format|pptx|docx|pdf.*word|format\?/.test(text) && /pdf|pptx|docx/.test(text));
        return !isFQ;
      });
      if (questions.length !== before) console.warn(`[finalize] stripped hallucinated format question for preferred=${preferred}`);
      // re-apply order after strip
      const sub2 = questions.filter((q) => !isLengthQ(q));
      const len2 = questions.filter(isLengthQ);
      questions = [...sub2, ...len2];
    }
    // Safety: if preferredFormat is pptx/docx/pdf and a length question is doc-style but format is slides, coerce placeholder (hybrid reliability)
    if (preferred && preferred !== "auto") {
      questions = questions.map((q) => {
        if (q.id === "length" && preferred === "pptx" && /how long\?/i.test(q.question)) {
          return { ...q, question: "How many slides?", options: q.options.some((o) => /\d/.test(o)) ? q.options : ["Short (5-6 slides)", "Standard (10-12 slides)", "Detailed (18-20 slides)"], placeholder: "e.g., 12 slides" };
        }
        if (q.id === "length" && preferred !== "pptx" && /how many slides/i.test(q.question)) {
          return { ...q, question: "How long?", options: ["Short (1 page)", "Standard (2-4 pages)", "Detailed (6+ pages)"], placeholder: "e.g., 5 pages" };
        }
        return q;
      });
    }
    // Deterministic no-repeat: drop already-answered dimensions (a last-turn
    // revision exempts only its own bucket). Runs before the cap so
    // tail-protection can never resurrect a suppressed repeat. Answers act as
    // sticky preferences until the user revises them.
    if (askedAnswered) {
      const lastText = lastUserText ?? "";
      const revF = isFormatRevision(lastText);
      const revL = isLengthRevision(lastText);
      const seenBucket: Record<"format" | "length", boolean> = { format: false, length: false };
      questions = questions.filter((q) => {
        if (isFormatQ(q)) {
          if (seenBucket.format) return false;
          seenBucket.format = true;
          return revF || !askedAnswered.answeredFormat;
        }
        if (isLengthQ(q)) {
          if (seenBucket.length) return false;
          seenBucket.length = true;
          return revL || !askedAnswered.answeredLength;
        }
        const nq = normQText(q.question);
        if (!nq) return true;
        for (const aq of askedAnswered.answeredNormQ) {
          if (nq === aq || jaccard(nq, aq) >= 0.9) return false;
        }
        return true;
      });
    }
    // Enforce single-turn cap: max 4 questions (UX) — drop extras beyond 4, keep tail (format/length) protected
    if (questions.length > 4) {
      const tail = [...questions.filter(isFormatQ), ...questions.filter(isLengthQ)].slice(-2);
      const headCap = 4 - tail.length;
      const head = questions.filter((q) => !isFormatQ(q) && !isLengthQ(q)).slice(0, headCap);
      questions = [...head, ...tail];
    }
    if (!questions.length) return { kind: "reply", message: sanitizeChatMessage(r.message) || "Tell me a bit more about what you need." };
    return { kind: "clarify", message: sanitizeChatMessage(r.message) || "A couple of quick questions to shape this well:", questions };
  }
  if (r.kind === "outline") {
    const o = r.outline as Parameters<typeof normalizeOutline>[0] & { requestedWords?: number };
    if (preferred && preferred !== "auto") o.format = preferred;
    // Deterministic override: never trust the free-tier model with word/char counts.
    if (parsedWords) {
      o.requestedWords = parsedWords.words;
      o.targetLength = parsedWords.pages;
      (o as { lengthSource?: string }).lengthSource = "user";
    }
    // Guard absurd values the model sometimes emits (e.g. targetLength: 500 from "500 words").
    if (typeof o.targetLength === "number" && o.targetLength > 30) {
      o.targetLength = parsedWords ? parsedWords.pages : 30;
      if (parsedWords) (o as { lengthSource?: string }).lengthSource = "user";
    }
    // Template default length when the model left it inferred-and-empty.
    if (template && (o as { lengthSource?: string }).lengthSource !== "user" && !o.targetLength) {
      o.targetLength = template.targetLength;
    }
    // Deterministic cover-header restore: the LLM often drops Group/members,
    // so re-derive from the user's own words and merge (explicit wins).
    // Priority: saved header (base) <- LLM header <- words in this turn (highest).
    try {
      const fromUser = extractCoverHeader(lastUserText ?? "");
      const fromLLM = (o as { header?: { group?: string; members?: string[] } }).header;
      const base = !isRemakeRequest(lastUserText ?? "") ? currentOutline?.header : undefined;
      const merged = mergeHeader(mergeHeader(base, fromLLM as never), fromUser as never);
      if (merged) (o as { header?: unknown }).header = merged;
    } catch {
      /* header restore must never break planning */
    }
    let outline = normalizeOutline(o);
    // Patch guard: when editing an existing file, never let a small follow-up
    // ("put Group on top", "add X") wipe sections the model forgot to echo back.
    // Only explicit remake language or a format switch allows a full rethink.
    try {
      const allowRemake = isRemakeRequest(lastUserText ?? "");
      const formatSwitched = Boolean(currentOutline && o.format && currentOutline.format !== o.format);
      if (currentOutline && !allowRemake && !formatSwitched) {
        outline = mergeOutlinePreserving(currentOutline, outline, {
          allowRemake: false,
          formatSwitched: false,
          explicitRemovals: explicitRemovalTitles(lastUserText ?? ""),
        });
      }
    } catch {
      /* merge must never break planning */
    }
    // Pad-only skeleton enforcement: missing template sections are appended,
    // user customizations are never removed or reordered.
    if (template) {
      const seen = new Set(outline.sections.map((s) => s.id));
      let n = 0;
      outline.sections = applyTemplateSkeleton(outline.sections, template, (base) => {
        let id = `${base}${++n}`;
        while (seen.has(id)) id = `${base}${++n}`;
        seen.add(id);
        return id;
      }) as typeof outline.sections;
    }
    return { kind: "outline", message: sanitizeChatMessage(r.message) || "Here is the outline. Edit anything, then generate.", outline };
  }
  return { kind: "reply", message: sanitizeChatMessage(r.message) || "How can I help?" };
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
