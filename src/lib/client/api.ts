import type { AgentRequest, AgentResponse, Attachment, DocumentSpec, ExpandRequest, FitInfo, Format } from "@/lib/spec/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) message = data.error;
  } catch {
    /* ignore */
  }
  throw new ApiError(message, res.status);
}

export async function extractFile(file: File): Promise<Omit<Attachment, "id" | "status">> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/extract", { method: "POST", body: form });
  if (!res.ok) await readError(res, "Could not read this file");
  return (await res.json()) as Omit<Attachment, "id" | "status">;
}

export async function askAgent(payload: AgentRequest): Promise<AgentResponse> {
  const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) await readError(res, "The assistant is unavailable right now");
  return (await res.json()) as AgentResponse;
}

export async function expandOutline(payload: ExpandRequest): Promise<{ spec: DocumentSpec; warnings: string[]; fit: FitInfo | null }> {
  const res = await fetch("/api/expand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) await readError(res, "Could not write the document content");
  return (await res.json()) as { spec: DocumentSpec; warnings: string[]; fit: FitInfo | null };
}

export type ExpandStreamEvent =
  | { type: "start"; total: number; outline: { title: string; format: Format } }
  | { type: "block"; block: DocumentSpec["blocks"][number]; index: number }
  | { type: "done"; spec: DocumentSpec; warnings: string[]; fit: FitInfo | null }
  | { type: "error"; error: string };

export async function* expandOutlineStream(payload: ExpandRequest): AsyncGenerator<ExpandStreamEvent, void, unknown> {
  const res = await fetch("/api/expand?stream=1", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
  });
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

export async function renderFile(spec: DocumentSpec, format: Format): Promise<{ blob: Blob; fileName: string }> {
  const res = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec, format }) });
  if (!res.ok) await readError(res, `Could not render the ${format.toUpperCase()}`);
  const blob = await res.blob();
  const fileName = res.headers.get("X-File-Name") || `document.${format}`;
  return { blob, fileName };
}

/** PDF twin of the given format, for on-screen preview and image export. */
export async function renderPreview(spec: DocumentSpec, format: Format): Promise<ArrayBuffer> {
  const res = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec, format, preview: true }) });
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

/** Plain Markdown rendition of the generated content. */
export function specToMarkdown(spec: DocumentSpec): string {
  const out: string[] = [`# ${spec.title}`];
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
    if (b.notes) out.push(`<!-- notes: ${b.notes} -->`, "");
  }
  return out.join("\n");
}
