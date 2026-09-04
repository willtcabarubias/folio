"use client";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Lazy-load pdf.js in the browser with the worker served from /public. */
export function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

export type RasterPage = { blob: Blob; width: number; height: number };

/**
 * Rasterize every page of a PDF to images. `width` is the output pixel width;
 * pages are reported progressively through `onPage`.
 */
export async function rasterizePdf(
  data: ArrayBuffer,
  opts: { width: number; type?: "image/png" | "image/jpeg"; quality?: number; onPage?: (index: number, total: number, page: RasterPage) => void; signal?: { cancelled: boolean } },
): Promise<RasterPage[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const pages: RasterPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (opts.signal?.cancelled) break;
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = opts.width / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas is not available");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), opts.type ?? "image/png", opts.quality));
      const result = { blob, width: canvas.width, height: canvas.height };
      pages.push(result);
      opts.onPage?.(i - 1, doc.numPages, result);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
