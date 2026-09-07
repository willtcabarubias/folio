import type { AgentRequest, AgentResponse, Attachment, DocumentSpec, ExpandRequest, FitInfo, Format } from "@/lib/spec/types";

export class ApiError extends Error {
  status: number;
  url?: string;
  method?: string;
  details?: string;
  constructor(message: string, status: number, opts?: { url?: string; method?: string; details?: string }) {
    super(message);
    this.status = status;
    this.url = opts?.url;
    this.method = opts?.method;
    this.details = opts?.details;
  }
}

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  let details: string | undefined;
  const url = res.url;
  const hint =
    res.status === 504
      ? "Vercel Hobby timeout (10s). Try a shorter document, fewer slides, or retry – the function was killed after 10s."
      : res.status === 413
        ? "Payload too large."
        : undefined;
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const data = (await res.json()) as { error?: string; details?: string; stack?: string };
      if (data?.error) message = data.error;
      if (data?.details || data?.stack) details = [data.details, data.stack].filter(Boolean).join("\n");
    } else {
      const text = (await res.text()).slice(0, 4000);
      if (text) {
        // Vercel 504 returns HTML; preserve snippet
        details = text;
        if (!text.includes(fallback) && text.length < 500) message = `${fallback}: ${text.slice(0, 200)}`;
        if (res.status === 504 && text.toLowerCase().includes("timeout")) {
          message = `${fallback} — timeout (504). Free tier 10s limit. ${hint ?? ""}`.trim();
        }
      }
    }
  } catch {
    /* ignore */
  }
  const err = new ApiError(hint ? `${message} — ${hint}` : message, res.status, {
    url,
    method: "POST",
    details: details ?? hint,
  });
  // attach hint for modal auto-open caller to use verbatim
  (err as unknown as Record<string, unknown>).hint = hint;
  throw err;
}

export async function extractFile(file: File): Promise<Omit<Attachment, "id" | "status">> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/extract", { method: "POST", body: form });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : "Network error while reading file", 0, { url: "/api/extract", method: "POST" });
  }
  if (!res.ok) await readError(res, "Could not read this file");
  return (await res.json()) as Omit<Attachment, "id" | "status">;
}

export async function askAgent(payload: AgentRequest): Promise<AgentResponse> {
  let res: Response;
  try {
    res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : "Network error – assistant unreachable", 0, { url: "/api/agent", method: "POST" });
  }
  if (!res.ok) await readError(res, "The assistant is unavailable right now");
  return (await res.json()) as AgentResponse;
}

export async function expandOutline(payload: ExpandRequest): Promise<{ spec: DocumentSpec; warnings: string[]; fit: FitInfo | null }> {
  let res: Response;
  try {
    res = await fetch("/api/expand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : "Network error while expanding", 0, { url: "/api/expand", method: "POST" });
  }
  if (!res.ok) await readError(res, "Could not write the document content");
  return (await res.json()) as { spec: DocumentSpec; warnings: string[]; fit: FitInfo | null };
}

export type ExpandStreamEvent =
  | { type: "start"; total: number; outline: { title: string; format: Format } }
  | { type: "block"; block: DocumentSpec["blocks"][number]; index: number }
  | { type: "done"; spec: DocumentSpec; warnings: string[]; fit: FitInfo | null }
  | { type: "done"; spec: null; blocks: DocumentSpec["blocks"]; partial: true; warnings: string[]; fit: null }
  | { type: "error"; error: string };

export async function* expandOutlineStream(payload: ExpandRequest): AsyncGenerator<ExpandStreamEvent, void, unknown> {
  let res: Response;
  try {
    res = await fetch("/api/expand?stream=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : "Network error while streaming", 0, { url: "/api/expand?stream=1", method: "POST" });
  }
  if (!res.ok) await readError(res, "Could not write the document content");
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError("Streaming not supported", 500);
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try {
        const evt = JSON.parse(jsonStr) as ExpandStreamEvent;
        if (evt.type === "error") throw new ApiError((evt as { error: string }).error, 500);
        yield evt;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        // ignore parse errors for keepalive
      }
    }
  }
}

export async function renderFile(spec: DocumentSpec, format: Format): Promise<{ blob: Blob; fileName: string; convertedFrom?: string; warnings?: string }> {
  let res: Response;
  try {
    res = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec, format }) });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : "Network error while rendering", 0, { url: "/api/render", method: "POST", details: String(e) });
  }
  if (!res.ok) await readError(res, `Could not render the ${format.toUpperCase()}`);
  const blob = await res.blob();
  const fileName = res.headers.get("X-File-Name") || `document.${format}`;
  const convertedFrom = res.headers.get("X-Converted") || undefined;
  let warnings: string | undefined;
  try {
    const raw = res.headers.get("X-Warnings");
    warnings = raw ? decodeURIComponent(raw) : undefined;
  } catch {
    warnings = undefined;
  }
  return { blob, fileName, convertedFrom, warnings };
}

/** PDF twin of the given format, for on-screen preview and image export. */
export async function renderPreview(spec: DocumentSpec, format: Format): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec, format, preview: true }) });
  } catch (e) {
    throw new ApiError(e instanceof Error ? e.message : "Network error while previewing", 0, { url: "/api/render?preview=1", method: "POST", details: String(e) });
  }
  if (!res.ok) await readError(res, "Could not render the preview");
  return res.arrayBuffer();
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function safeName(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}

/** Push ApiError into global log for debugging (auto-opens modal). Emits event consumed by ErrorProvider. */
export function reportApiError(err: unknown, fallback: string, source: import("@/lib/error/types").ErrorSource) {
  try {
    const detail =
      err instanceof ApiError
        ? {
            source,
            severity: "error" as const,
            message: err.message || fallback,
            status: err.status || undefined,
            url: err.url,
            method: err.method,
            details: err.details,
            stack: err.stack,
            hint: (err as unknown as { hint?: string }).hint,
          }
        : err instanceof Error
          ? {
              source,
              severity: "error" as const,
              message: err.message || fallback,
              stack: err.stack,
              details: String(err).slice(0, 3000),
            }
          : {
              source,
              severity: "error" as const,
              message: fallback,
              details: String(err).slice(0, 3000),
            };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("folio:push-error", { detail }));
    }
  } catch {}
}

/** Plain Markdown rendition of the generated content. */
export function specToMarkdown(spec: DocumentSpec): string {
  const out: string[] = [`# ${spec.title}`];
  if (spec.header?.group) out.push(`_${spec.header.group}_`);
  if (spec.header?.subject || spec.header?.section) out.push(`_${[spec.header.subject, spec.header.section].filter(Boolean).join(" · ")}_`);
  if (spec.header?.members?.length) out.push(`_${spec.header.members.join(" · ")}_`);
  if (spec.subtitle) out.push(`_${spec.subtitle}_`);
  out.push("");
  for (const b of spec.blocks) {
    if (b.layout === "cover") {
      if (b.bullets.length) out.push(b.bullets.join(" · "), "");
      if (b.body) out.push(b.body, "");
      continue;
    }
    out.push(`## ${b.title}`);
    if (b.subtitle) out.push(`_${b.subtitle}_`);
    out.push("");
    if (b.body) out.push(b.body, "");
    if (b.bullets.length) out.push(...b.bullets.map((x) => `- ${x}`), "");
    for (const c of b.columns ?? []) {
      if (c.heading) out.push(`### ${c.heading}`);
      if (c.body) out.push(c.body);
      out.push(...c.bullets.map((x) => `- ${x}`), "");
    }
    for (const g of b.groups ?? []) {
      out.push(`### ${g.heading}${g.meta ? ` — ${g.meta}` : ""}`);
      if (g.body) out.push(g.body);
      out.push(...g.bullets.map((x) => `- ${x}`), "");
    }
    if (b.stats?.length) out.push(...b.stats.map((s) => `- **${s.value}** ${s.label}${s.description ? ` — ${s.description}` : ""}`), "");
    if (b.steps?.length) out.push(...b.steps.map((s, i) => `${i + 1}. **${s.label}**${s.description ? ` — ${s.description}` : ""}`), "");
    if (b.quote) out.push(`> ${b.quote.text}${b.quote.attribution ? ` — ${b.quote.attribution}` : ""}`, "");
    if (b.table) {
      const cols = Math.max(b.table.headers.length, ...b.table.rows.map((r) => r.length));
      const headers = b.table.headers.length ? b.table.headers : Array(cols).fill("");
      out.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...b.table.rows.map((r) => `| ${r.join(" | ")} |`), "");
    }
    if (b.callout) out.push(`> **${b.callout}**`, "");
  }
  return out.join("\n");
}
