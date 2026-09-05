import type { ZodType } from "zod";

const BASE_URL =
  process.env.AI_BASE_URL || process.env.NVIDIA_BASE_URL || (process.env.AI_MODEL?.startsWith("opencode/") || process.env.NVIDIA_MODEL?.startsWith("opencode/") ? "https://api.opencode.ai/v1" : "https://integrate.api.nvidia.com/v1");
const DEFAULT_MODEL = process.env.AI_MODEL || process.env.NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };

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
  "AI_API_KEY (or NVIDIA_API_KEY) is missing. Create a .env.local file in the project root with AI_API_KEY=sk-... (or NVIDIA_API_KEY=nvapi-...) and restart the dev server.";

/** Reads the key tolerant of stray quotes/whitespace from hand-edited env files. */
export function getApiKey(): string {
  const raw = (process.env.AI_API_KEY ?? process.env.NVIDIA_API_KEY ?? "") as string;
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
  const thinking = opts.thinking ?? (process.env.AI_THINKING ?? process.env.NVIDIA_THINKING) === "on";
  const isNvidia = BASE_URL.includes("nvidia.com");

  const body: Record<string, unknown> = {
    model: DEFAULT_MODEL,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.5,
    top_p: 0.95,
    stream: true,
  };
  if (isNvidia) {
    (body as any).chat_template_kwargs = { enable_thinking: thinking };
    if (thinking) (body as any).reasoning_budget = 4096;
  }
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
    if (res.status === 401 || res.status === 403) throw new AIError(`The API key was rejected (401) for ${BASE_URL} / ${DEFAULT_MODEL}. Check AI_API_KEY in .env.local and restart the server.`, 500);
    if (res.status === 429) throw new AIError("The model is rate limited right now, please retry in a moment", 429);
    if (res.status === 404) throw new AIError(`Model endpoint Not Found (404) for ${BASE_URL}/chat/completions with model ${DEFAULT_MODEL}: ${text.slice(0, 400)} — check AI_BASE_URL and AI_MODEL, then restart.`, 502);
    throw new AIError(`Model request failed (${res.status}) at ${BASE_URL}: ${text.slice(0, 300)}`, 502);
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

/** Single chat completion — routes to NVIDIA or Zen (responses) automatically. */
export async function chatCompletion(opts: CompletionOptions): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new AIError(MISSING_KEY_MESSAGE, 500);

  const isZen = BASE_URL.includes("opencode.ai/zen");
  const apiModel = (DEFAULT_MODEL || "").replace(/^opencode\//, "");
  // Zen Muse Spark / GPT / etc use the Responses API at /responses, not /chat/completions
  const useResponses = isZen && /^(muse-spark|gpt-|claude-|gemini|grok)/i.test(apiModel);

  if (useResponses) {
    return chatCompletionZen(opts, apiModel);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 240_000);
  const thinking = opts.thinking ?? (process.env.AI_THINKING ?? process.env.NVIDIA_THINKING) === "on";
  const isNvidia = BASE_URL.includes("nvidia.com");

  const body: Record<string, unknown> = {
    model: apiModel,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.5,
    top_p: 0.95,
    stream: false,
  };
  if (isNvidia) {
    (body as any).chat_template_kwargs = { enable_thinking: thinking };
    if (thinking) (body as any).reasoning_budget = 4096;
  }
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
    if (lastStatus === 401 || lastStatus === 403) throw new AIError(`The API key was rejected (401) for ${BASE_URL} / ${DEFAULT_MODEL}. Check AI_API_KEY (or NVIDIA_API_KEY) in .env.local and restart the dev server.`, 500);
    if (lastStatus === 429) throw new AIError("The model is rate limited right now, please retry in a moment", 429);
    if (lastStatus === 503) throw new AIError("The model service is temporarily overloaded. Please try again in a moment.", 503);
    if (lastStatus === 404) throw new AIError(`Model endpoint Not Found (404) for ${BASE_URL}/chat/completions with model ${DEFAULT_MODEL}: ${lastText.slice(0, 400)} — check AI_BASE_URL and AI_MODEL, then restart the server.`, 502);
    throw new AIError(`Model request failed (${lastStatus}) at ${BASE_URL}: ${lastText.slice(0, 300)}`, 502);
  }

  let data: { choices?: { message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string }[] };
  try {
    data = (await res.json()) as typeof data;
  } catch (e) {
    const txt = await res.text().catch(() => "");
    throw new AIError(`Model returned non-JSON (${res.status}): ${txt.slice(0, 300) || (e as Error).message}`, 502);
  }
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

async function chatCompletionZen(opts: CompletionOptions, apiModel: string): Promise<string> {
  const apiKey = getApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 240_000);
  // Zen Responses API: https://opencode.ai/zen/v1/responses  (OpenAI Responses)
  const input = opts.messages.map((m) => {
    if (Array.isArray(m.content)) {
      // Convert OpenAI chat vision parts to Zen Responses input_* types
      const conv = (m.content as any[]).map((p: any) => {
        if (p.type === "image_url" && p.image_url?.url) return { type: "input_image", image_url: p.image_url.url };
        if (p.type === "text") return { type: "input_text", text: p.text };
        if (p.type === "input_text" || p.type === "input_image") return p;
        return p;
      });
      return { role: m.role as "user" | "assistant" | "system", content: conv };
    }
    return { role: m.role as "user" | "assistant" | "system", content: m.content };
  });
  // Muse Spark reasoning is expensive — use low effort and ensure enough output tokens for reasoning + JSON
  const requestedMax = opts.maxTokens ?? 4096;
  // For structured JSON tasks, ensure at least 8000 to avoid truncation (reasoning can consume 4k+)
  const maxOut = opts.json ? Math.max(requestedMax, 8000) : Math.max(requestedMax, 2000);
  const body: Record<string, unknown> = {
    model: apiModel,
    input,
    max_output_tokens: maxOut,
    temperature: opts.temperature ?? 0.5,
    reasoning: { effort: "low" },
    stream: false,
  };
  if (opts.json) (body as any).text = { format: { type: "json_object" } };
  let res: Response | null = null;
  let lastStatus = 0;
  let lastText = "";
  const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
  const delays = [1200, 2600, 4500];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      res = await fetch(`${BASE_URL}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new AIError(aborted ? "The model took too long to respond" : `Could not reach Zen: ${(err as Error).message}`, 504);
    }
    if (res.ok) break;
    lastStatus = res.status;
    lastText = await res.text().catch(() => "");
    if (!TRANSIENT.has(res.status) || attempt === delays.length) break;
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
  clearTimeout(timer);
  if (!res || !res.ok) {
    if (lastStatus === 401 || lastStatus === 403) throw new AIError(`Zen API key rejected (401) for ${BASE_URL}/responses model ${apiModel}. Check AI_API_KEY.`, 500);
    throw new AIError(`Zen request failed (${lastStatus}) at ${BASE_URL}/responses: ${lastText.slice(0, 400)}`, 502);
  }
  let data: any;
  try {
    data = await res.json();
  } catch (e) {
    const txt = await res.text().catch(() => "");
    throw new AIError(`Zen returned non-JSON (${res.status}): ${txt.slice(0, 300) || (e as Error).message}`, 502);
  }
  // Responses API shapes vary: try output_text, output[0].content[0].text, etc.
  let content: string | null = null;
  if (typeof data.output_text === "string") content = data.output_text;
  else if (Array.isArray(data.output)) {
    // output is array of items with content array
    const texts: string[] = [];
    for (const item of data.output) {
      if (item.content && Array.isArray(item.content)) for (const c of item.content) if (c.text) texts.push(c.text);
      else if (item.text) texts.push(item.text);
    }
    if (texts.length) content = texts.join("\n");
    else if (data.output[0]?.content?.[0]?.text) content = data.output[0].content[0].text;
  }
  if (!content) content = (data as any).choices?.[0]?.message?.content ?? (data as any).output?.[0]?.content?.[0]?.text ?? (data as any).choices?.[0]?.text ?? "";
  if (!content || !String(content).trim()) throw new AIError(`Zen returned empty response: ${JSON.stringify(data).slice(0, 800)}`, 502);
  let str = stripThinking(String(content));
  // handle finish length for json
  if ((data as any).incomplete_details?.reason === "max_output_tokens" && opts.json) {
    const fixed = tryExtractJSON(str);
    if (!fixed) throw new AIError("Zen response was cut off. Try a shorter document.", 502);
  }
  return str;
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
