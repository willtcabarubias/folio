import { NextResponse } from "next/server";
import { AIError, MISSING_KEY_MESSAGE, generateStructured, isConfigured, type ChatMessage } from "@/lib/ai/client";
import { MAX_CLARIFY_ROUNDS, agentSystemPrompt, attachmentsToPromptText } from "@/lib/ai/prompts";
import { normalizeOutline } from "@/lib/spec/normalize";
import { AgentResponseSchema, type AgentRequest, type AgentResponse, type Format, type Question } from "@/lib/spec/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ATTACHMENT_BUDGET = 60_000;

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

  const attachments = (body.attachments ?? []).filter((a) => a && (a.text?.trim() || (a as any).isImage)).slice(0, 8);
  const clarifyRounds = messages.filter((m) => m.role === "assistant" && /"kind"\s*:\s*"clarify"/.test(m.content)).length;
  const hasOutline = Boolean(body.currentOutline);

  const system = agentSystemPrompt({
    clarifyRounds,
    hasAttachments: attachments.length > 0,
    preferredFormat: body.preferredFormat,
    hasOutline,
  });

  const convo: ChatMessage[] = messages.slice(-16).map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }));

  // Context block goes right before the latest user message so it stays salient.
  const contextParts: string[] = [];
  // For vision, keep text attachments in prompt text; images will be sent as vision parts (no base64 in text)
  const textAtts = attachments.filter((a) => !(a as any).isImage);
  const imageAtts = attachments.filter((a) => (a as any).isImage && (a as any).dataUrl);
  if (textAtts.length) contextParts.push(`Attached source material:\n${attachmentsToPromptText(textAtts as any, ATTACHMENT_BUDGET)}`);
  if (imageAtts.length) contextParts.push(`Images attached (${imageAtts.length}): ${imageAtts.map((a) => a.name).join(", ")} — use vision to describe/OCR if needed.`);
  if (body.currentOutline) contextParts.push(`Current outline (source of truth, may include the user's manual edits):\n${JSON.stringify(body.currentOutline)}`);
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
      result = await generateStructured({
        schema: AgentResponseSchema,
        system,
        messages: [...convo, { role: "user", content: "Do not ask more questions. Produce the outline now with sensible defaults." }],
        maxTokens: 6000,
        temperature: 0.4,
        label: "Planner",
      });
    }

    // Guard: vague file tasks must not be answered inline — force clarify with stepper UI.
    // Business rule: we are a document generator, not ChatGPT — "explain this" with a file must become a document, not an inline chat answer.
    const lastUserRaw = messages[messages.length - 1]?.content ?? "";
    const isVagueFileTask =
      attachments.length > 0 &&
      /summar|summry|explain|describe|what.*is.*this|what.*does.*this|what.*say|tell.*about|identify|what.*wrong|what.*issue|critique|review this|extract|find.*(wrong|issue|error|problem)/i.test(lastUserRaw);
    const isGenericExplainReply =
      attachments.length > 0 &&
      result.kind === "reply" &&
      /happy to help|what would you like me to explain|let me know.*explain|paste the content here/i.test((result as { message: string }).message ?? "");
    if ((result.kind === "reply" && isVagueFileTask) || isGenericExplainReply) {
      result = await generateStructured({
        schema: AgentResponseSchema,
        system,
        messages: [
          ...convo,
          {
            role: "user",
            content:
              "Your last answer was an inline reply, but the user attached a file and asked a vague file task (summarize / explain this / describe what this is / identify what's wrong / critique / review). You MUST return kind \"clarify\" with 1-2 questions (Q1 focus: Whole document | Key concepts | Section breakdown | Actionable takeaways [ui hybrid, placeholder \"e.g., key concepts\"], Q2 format: Explainer 2-4 pages PDF [Rec] | Study guide | Slide deck [ui radio]) and do NOT explain the file inline. We are a document generator — convert the request into a file. Keep questions few when task is clear.",
          },
        ],
        maxTokens: 6000,
        temperature: 0.4,
        label: "Planner-retry-file-task",
      });
    }

    const response = finalize(result, body.preferredFormat);
    return NextResponse.json(response);
  } catch (err) {
    const status = err instanceof AIError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[agent]", message, stack);
    return NextResponse.json({ error: message, details: stack?.slice(0, 3000), stack: stack?.slice(0, 4000) }, { status });
  }
}

function finalize(result: unknown, preferred?: Format | "auto"): AgentResponse {
  const r = result as { kind: string; message: string; questions?: unknown[]; outline?: unknown };
  if (r.kind === "clarify") {
    let questions = (r.questions as { id?: string; question: string; options: string[]; recommended?: string; allowMultiple: boolean; ui?: string; placeholder?: string }[])
      .map((q, i): Question => {
        const options = dedupe(q.options.map((o) => o.trim()).filter(Boolean)).slice(0, 6);
        const recommended = q.recommended && options.includes(q.recommended) ? q.recommended : options[0];
        const uiRaw = typeof q.ui === "string" ? q.ui.toLowerCase().trim() : undefined;
        const ui = uiRaw === "radio" || uiRaw === "checkbox" || uiRaw === "text" || uiRaw === "hybrid" ? (uiRaw as Question["ui"]) : undefined;
        // infer ui from allowMultiple when not provided: multi → checkbox, single+options→ hybrid (options + Other field), no options→ text
        const inferredUi: Question["ui"] = ui ?? (options.length === 0 ? "text" : q.allowMultiple ? "checkbox" : "hybrid");
        return { id: q.id?.trim() || `q${i + 1}`, question: q.question.trim(), options, recommended, allowMultiple: q.allowMultiple, ui: inferredUi, placeholder: typeof q.placeholder === "string" && q.placeholder.trim() ? q.placeholder.trim().slice(0, 80) : undefined };
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
          return { ...q, question: "How many slides?", options: q.options.some((o) => /\d/.test(o)) ? q.options : ["6", "10-12", "15"], placeholder: "e.g., 12 slides" };
        }
        if (q.id === "length" && preferred !== "pptx" && /how many slides/i.test(q.question)) {
          return { ...q, question: "How long?", options: ["1 page", "2-4 pages", "6 pages"], placeholder: "e.g., 5 pages" };
        }
        return q;
      });
    }
    // Enforce single-turn cap: max 4 questions (UX) — drop extras beyond 4, keep tail (format/length) protected
    if (questions.length > 4) {
      const tail = [...questions.filter(isFormatQ), ...questions.filter(isLengthQ)].slice(-2);
      const headCap = 4 - tail.length;
      const head = questions.filter((q) => !isFormatQ(q) && !isLengthQ(q)).slice(0, headCap);
      questions = [...head, ...tail];
    }
    if (!questions.length) return { kind: "reply", message: r.message || "Tell me a bit more about what you need." };
    return { kind: "clarify", message: r.message || "A couple of quick questions to shape this well:", questions };
  }
  if (r.kind === "outline") {
    const o = r.outline as Parameters<typeof normalizeOutline>[0];
    if (preferred && preferred !== "auto") o.format = preferred;
    const outline = normalizeOutline(o);
    return { kind: "outline", message: r.message || "Here is the outline. Edit anything, then generate.", outline };
  }
  return { kind: "reply", message: r.message || "How can I help?" };
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
