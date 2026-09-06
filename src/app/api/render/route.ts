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
    const origin = (spec as any).originFormat as Format | undefined;
    // Hybrid architecture: allow cross-format export via safe reflow instead of hard 403.
    // - pptx->pdf keeps slide geometry (no reflow, best fidelity).
    // - docx<->pdf reflows via designPass + fitToPages (structure preserved, pagination adapts).
    // - pptx<->docx and pdf->pptx are allowed but flagged as converted (layout adapts, warn in UI via X-Converted header).
    const isSameSlidePdf = origin === "pptx" && format === "pdf";
    const needsRedesign = !isSameSlidePdf && spec.format !== format;
    let converted = false;
    if (needsRedesign) {
      const from = spec.format;
      spec = await redesign(spec, format);
      // Mark non-trivial conversions so UI can toast "Converted from X — check layout".
      converted = (from === "pptx" && format === "docx") || (from !== "pptx" && format === "pptx");
    }

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
      const ratio = pdfSupportRatio(spec);
      if (ratio < 0.85) {
        return NextResponse.json(
          {
            error: `PDF export supports Latin-script languages (this doc is ${Math.round(ratio * 100)}% Latin). Export as DOCX for full fidelity, then Save-as-PDF in Word.`,
            code: "non_latin_pdf",
            hint: "DOCX preserves all scripts. PDF uses WinAnsi standard fonts only.",
          },
          { status: 422 },
        );
      }
      // pptx origin pdf keeps slide size (no reflow)
      if ((spec as any).originFormat === "pptx" || spec.format === "pptx") buffer = await renderSlidesPdf(spec);
      else buffer = await renderPdf(spec);
    }
    const filename = safeFileName(spec.title, format);
    // QA warnings as header (non-blocking, UI can toast). Keep small to avoid header limits.
    let qaHeader = "";
    try {
      const { validateSpecForExport } = await import("@/lib/validate");
      qaHeader = validateSpecForExport(spec).slice(0, 3).join(" | ").slice(0, 500);
    } catch {
      // QA must never break render.
    }
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
        "X-File-Name": filename,
        ...(converted ? { "X-Converted": `from-${origin ?? spec.format}` } : {}),
        ...(qaHeader ? { "X-Warnings": encodeURIComponent(qaHeader) } : {}),
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
