/**
 * Server-side text extraction for user uploads.
 * Supported: PDF, DOCX, PPTX (slide XML), TXT, MD, CSV, JSON, HTML, RTF-ish plain text.
 */

export type ExtractResult = { text: string; pages?: number; kind: string };

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TEXT_CHARS = 120_000;

const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "html", "htm", "xml", "yaml", "yml", "log", "rtf", "tex"]);

export function fileKind(name: string, mime: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx" || mime.includes("wordprocessingml")) return "docx";
  if (ext === "pptx" || mime.includes("presentationml")) return "pptx";
  if (TEXT_EXT.has(ext) || mime.startsWith("text/") || mime === "application/json") return ext || "txt";
  return "unsupported";
}

export async function extractText(buffer: Buffer, name: string, mime: string): Promise<ExtractResult> {
  const kind = fileKind(name, mime);
  if (kind === "unsupported") throw new Error("Unsupported file type. Use PDF, DOCX, PPTX, TXT, MD or CSV.");

  let text = "";
  let pages: number | undefined;

  if (kind === "pdf") {
    const { extractText: unpdfExtract } = await import("unpdf");
    const result = await unpdfExtract(new Uint8Array(buffer), { mergePages: true });
    text = typeof result.text === "string" ? result.text : (result.text as unknown as string[]).join("\n\n");
    pages = result.totalPages;
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (kind === "pptx") {
    text = await extractPptx(buffer);
  } else {
    text = buffer.toString("utf8");
    if (kind === "html" || kind === "htm") text = stripHtml(text);
  }

  text = tidy(text);
  if (!text) throw new Error("No readable text found in this file (scanned PDFs need OCR).");
  if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS)}\n[... truncated]`;
  return { text, pages, kind };
}

async function extractPptx(buffer: Buffer): Promise<string> {
  // JSZip ships with pptxgenjs/docx; load lazily so the dependency stays optional.
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10) - parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10));
  const parts: string[] = [];
  for (const [i, f] of slideFiles.entries()) {
    const xml = await zip.files[f].async("string");
    const runs = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => decodeXml(m[1]));
    if (runs.length) parts.push(`Slide ${i + 1}:\n${runs.join(" ")}`);
  }
  return parts.join("\n\n");
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|li|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function tidy(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
