import { NextResponse } from "next/server";
import { renderDocx } from "@/lib/render/docx";
import { fitToPages } from "@/lib/render/fit";
import { pdfSupportRatio, renderPdf } from "@/lib/render/pdf";
import { renderSlidesPdf } from "@/lib/render/slides/pdf";
import { renderPptx } from "@/lib/render/slides/pptx";
import { designPass, safeFileName, specToOutline } from "@/lib/spec/normalize";
import { DEFAULT_THEME, FORMATS, type DocumentSpec, type Format, type RenderRequest } from "@/lib/spec/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIME: Record<Format, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

function sanitize(spec: DocumentSpec, format: Format): DocumentSpec {
  return {
    ...spec,
    title: String(spec.title).slice(0, 200),
    language: spec.language || "English",
    docType: spec.docType || (format === "pptx" ? "presentation" : "document"),
    pageSize: spec.pageSize === "Letter" ? "Letter" : "A4",
    theme: spec.theme || DEFAULT_THEME,
    format: spec.format || format,
    originFormat: (spec as any).originFormat || (spec.format as Format) || format,
    blocks: spec.blocks.map((b, i) => ({ ...b, id: b.id || `b${i + 1}`, bullets: Array.isArray(b.bullets) ? b.bullets : [], title: b.title || "" })),
  };
}

/** Re-run the design pass when exporting to a format the content was not designed for. */
async function redesign(spec: DocumentSpec, format: Format): Promise<DocumentSpec> {
  const outline = specToOutline(spec, format);
  const blocks = spec.blocks.map((b) => ({ ...b, id: b.id.replace(/_\d+$/, "") }));
  let next = designPass(outline, blocks, format);
  if (format !== "pptx") next = await fitToPages(next);
  return next;
}

export async function POST(req: Request) {
  let body: RenderRequest;
  try {
    body = (await req.json()) as RenderRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const format = body.format;
  if (!FORMATS.includes(format)) return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  if (!body.spec || !Array.isArray(body.spec.blocks) || !body.spec.blocks.length || !body.spec.title) {
    return NextResponse.json({ error: "Document spec is empty" }, { status: 400 });
  }

  try {
    let spec = sanitize(body.spec, format);
    // Export lock: pptx→pptx/pdf (pdf keeps slide size), docx/pdf → docx/pdf
    const origin = (spec as any).originFormat as Format | undefined;
    const allow: Record<Format, Format[]> = {
      pptx: ["pptx", "pdf"],
      docx: ["docx", "pdf"],
      pdf: ["pdf", "docx"],
    };
    if (origin && !allow[origin].includes(format)) {
      return NextResponse.json({ error: `This document was created as ${origin.toUpperCase()} and can only be exported as ${allow[origin].join("/").toUpperCase()}.` }, { status: 403 });
    }
    // Keep slide geometry for pptx→pdf (no reflow): use slide PDF, not document reflow
    const isSameSlidePdf = origin === "pptx" && format === "pdf";
    if (!isSameSlidePdf && spec.format !== format) spec = await redesign(spec, format);

    if (body.preview) {
      const buffer = format === "pptx" ? await renderSlidesPdf(spec) : await renderPdf(spec);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Length": String(buffer.length), "Cache-Control": "no-store", "X-Pages": String(spec.fit?.pages ?? "") },
      });
    }

    let buffer: Buffer;
    if (format === "pptx") buffer = await renderPptx(spec);
    else if (format === "docx") buffer = await renderDocx(spec);
    else {
      if (pdfSupportRatio(spec) < 0.85) {
        return NextResponse.json({ error: "PDF export currently supports Latin-script languages. Export as DOCX or PPTX for this document." }, { status: 422 });
      }
      // pptx origin pdf keeps slide size (no reflow)
      if ((spec as any).originFormat === "pptx" || spec.format === "pptx") buffer = await renderSlidesPdf(spec);
      else buffer = await renderPdf(spec);
    }
    const filename = safeFileName(spec.title, format);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
        "X-File-Name": filename,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    const stack = err instanceof Error ? err.stack : undefined;
    const cause = err instanceof Error ? (err as unknown as { cause?: unknown }).cause : undefined;
    console.error("[render]", format, message, stack, cause);
    // Return rich payload for global error modal (client auto-opens)
    return NextResponse.json(
      {
        error: `Could not render ${format.toUpperCase()}: ${message}`,
        details: cause ? String(cause).slice(0, 2000) : undefined,
        stack: stack?.slice(0, 4000),
        hint:
          message.toLowerCase().includes("timeout") || message.toLowerCase().includes("504")
            ? "Vercel Hobby free tier kills functions after ~10s. Try a shorter document or fewer slides, or upgrade."
            : undefined,
      },
      { status: 500 },
    );
  }
}
