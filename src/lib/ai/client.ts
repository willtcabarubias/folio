import type { ZodType } from "zod";

const BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = process.env.NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class AIError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "AIError";
    this.status = status;
  }
}

type CompletionOptions = {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
  thinking?: boolean;
};

export const MISSING_KEY_MESSAGE =
  "NVIDIA_API_KEY is missing. Create a .env.local file in the project root with NVIDIA_API_KEY=nvapi-... and restart the dev server.";

/** Reads the key tolerant of stray quotes/whitespace from hand-edited env files. */
export function getApiKey(): string {
  const raw = process.env.NVIDIA_API_KEY ?? "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function isConfigured(): boolean {
  return getApiKey().length > 0;
}

export function modelName(): string {
  return DEFAULT_MODEL;
}

/** Streaming chat completion — yields delta content tokens as they arrive (SSE). */
export async function* chatCompletionStream(opts: CompletionOptions): AsyncGenerator<string, void, unknown> {
  const apiKey = getApiKey();
  if (!apiKey) throw new AIError(MISSING_KEY_MESSAGE, 500);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 240_000);
  const thinking = opts.thinking ?? process.env.NVIDIA_THINKING === "on";

  const body: Record<string, unknown> = {
    model: DEFAULT_MODEL,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.5,
    top_p: 0.95,
    stream: true,
    chat_template_kwargs: { enable_thinking: thinking },
  };
  if (thinking) body.reasoning_budget = 4096;
  if (opts.json) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new AIError(aborted ? "The model took too long to respond" : `Could not reach the model: ${(err as Error).message}`, 504);
  }

  if (!res.ok) {
    clearTimeout(timer);
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new AIError("The NVIDIA API key was rejected (401). Check NVIDIA_API_KEY in .env.local and restart the server.", 500);
    if (res.status === 429) throw new AIError("The model is rate limited right now, please retry in a moment", 429);
    throw new AIError(`Model request failed (${res.status}): ${text.slice(0, 300)}`, 502);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    clearTimeout(timer);
    throw new AIError("Streaming not supported by model response", 502);
  }
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (trimmed.startsWith("data:")) {
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try {
            const data = JSON.parse(jsonStr) as { choices?: { delta?: { content?: string | null }; message?: { content?: string | null } }[] };
            const delta = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content ?? "";
            if (delta) yield delta;
          } catch {
            // ignore partial JSON
          }
        }
      }
    }
  } finally {
    clearTimeout(timer);
    try { await reader.cancel(); } catch {}
  }
}

/** Single chat completion against the NVIDIA NIM OpenAI-compatible endpoint. */
export async function chatCompletion(opts: CompletionOptions): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new AIError(MISSING_KEY_MESSAGE, 500);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 240_000);
  const thinking = opts.thinking ?? process.env.NVIDIA_THINKING === "on";

  const body: Record<string, unknown> = {
    model: DEFAULT_MODEL,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.5,
    top_p: 0.95,
    stream: false,
    chat_template_kwargs: { enable_thinking: thinking },
  };
  if (thinking) body.reasoning_budget = 4096;
  if (opts.json) body.response_format = { type: "json_object" };

  // Transient upstream failures (overload, rate limit, gateway) are retried with backoff.
  const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
  const delays = [1200, 2600, 4500];
  let res: Response | null = null;
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new AIError(aborted ? "The model took too long to respond" : `Could not reach the model: ${(err as Error).message}`, 504);
    }
    if (res.ok) break;
    lastStatus = res.status;
    lastText = await res.text().catch(() => "");
    if (!TRANSIENT.has(res.status) || attempt === delays.length) break;
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
  clearTimeout(timer);

  if (!res || !res.ok) {
    if (lastStatus === 401 || lastStatus === 403) throw new AIError("The NVIDIA API key was rejected (401). Check NVIDIA_API_KEY in .env.local and restart the server.", 500);
    if (lastStatus === 429) throw new AIError("The model is rate limited right now, please retry in a moment", 429);
    if (lastStatus === 503) throw new AIError("The model service is temporarily overloaded. Please try again in a moment.", 503);
    throw new AIError(`Model request failed (${lastStatus}): ${lastText.slice(0, 300)}`, 502);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const finish = data.choices?.[0]?.finish_reason;
  if (!content.trim()) throw new AIError("The model returned an empty response", 502);
  if (finish === "length" && opts.json) {
    // Truncated JSON is unrecoverable; surface it so the caller can retry smaller.
    const fixed = tryExtractJSON(content);
    if (!fixed) throw new AIError("The model response was cut off. Try a shorter document.", 502);
  }
  return stripThinking(content);
}

export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").trim();
}

/** Robust JSON extraction: handles code fences, prose before/after, and trailing commas. */
export function tryExtractJSON(text: string): unknown | null {
  const cleaned = stripThinking(text);
  const candidates: string[] = [];
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  candidates.push(cleaned);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) candidates.push(cleaned.slice(firstBracket, lastBracket + 1));

  for (const c of candidates) {
    const attempts = [c, c.replace(/,\s*([}\]])/g, "$1"), repairTruncated(c)];
    for (const a of attempts) {
      if (!a) continue;
      try {
        return JSON.parse(a);
      } catch {
        /* next */
      }
    }
  }
  return null;
}

/** Best-effort close of a truncated JSON document (strings, arrays, objects). */
function repairTruncated(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let out = s.slice(start);
  // Drop a dangling partial key/value after the last comma.
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of out) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, "");
  out = out.replace(/:\s*$/, ': ""');
  while (stack.length) {
    const open = stack.pop();
    out += open === "{" ? "}" : "]";
  }
  out = out.replace(/,\s*([}\]])/g, "$1");
  return out;
}

export async function* chatCompletionStreamToText(opts: CompletionOptions): AsyncGenerator<string, void, unknown> {
  let acc = "";
  for await (const delta of chatCompletionStream(opts)) {
    acc += delta;
    yield acc;
  }
}

type StructuredOptions<T> = {
  schema: ZodType<T>;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  retries?: number;
  label?: string;
};

/**
 * Ask the model for JSON, validate it against a schema, and give it one chance to
 * repair its own output when validation fails.
 */
export async function generateStructured<T>(opts: StructuredOptions<T>): Promise<T> {
  const retries = opts.retries ?? 1;
  const base: ChatMessage[] = [{ role: "system", content: opts.system }, ...opts.messages];
  let lastError = "";
  let lastRaw = "";

  for (let attempt = 0; attempt <= retries; attempt++) {
    const messages: ChatMessage[] =
      attempt === 0
        ? base
        : [
            ...base,
            { role: "assistant", content: lastRaw.slice(0, 12000) },
            {
              role: "user",
              content: `Your previous JSON was invalid: ${lastError.slice(0, 800)}. Return the complete corrected JSON object only, with no commentary.`,
            },
          ];
    let raw: string;
    try {
      raw = await chatCompletion({
        messages,
        json: true,
        maxTokens: opts.maxTokens,
        temperature: attempt === 0 ? opts.temperature : Math.max(0.1, (opts.temperature ?? 0.5) - 0.2),
      });
    } catch (err) {
      if (err instanceof AIError && (err.status === 429 || err.status === 503) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500));
        lastError = err.message;
        lastRaw = "";
        continue;
      }
      throw err;
    }
    lastRaw = raw;
    const parsed = tryExtractJSON(raw);
    if (parsed === null) {
      lastError = "not parseable JSON";
      continue;
    }
    const result = opts.schema.safeParse(parsed);
    if (result.success) return result.data;
    lastError = result.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
  }
  throw new AIError(`${opts.label ?? "Model"} output did not match the expected structure (${lastError})`, 502);
}
