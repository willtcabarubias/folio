"use client";

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * True on old browsers (e.g. Android Chrome < 140) whose JS engine lacks
 * `Uint8Array.prototype.toHex`, which pdfjs-dist v6 calls during document load.
 * Modern browsers return false — their path below stays byte-identical to before.
 */
export function needsLegacyPdfFallback(): boolean {
  try {
    return typeof Uint8Array.prototype !== "undefined" && typeof (Uint8Array.prototype as unknown as Record<string, unknown>).toHex !== "function";
  } catch {
    return false;
  }
}

/**
 * Scoped fallback: MDN-spec `toHex` polyfill, installed ONLY when missing.
 * No-op on modern browsers (current state untouched).
 */
function installToHexPolyfill(): void {
  try {
    const proto = Uint8Array.prototype as unknown as Record<string, unknown>;
    if (typeof proto.toHex !== "function") {
      const table = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
      Object.defineProperty(proto, "toHex", {
        value: function (this: Uint8Array): string {
          let out = "";
          for (let i = 0; i < this.length; i++) out += table[this[i]];
          return out;
        },
        writable: true,
        configurable: true,
      });
    }
    if (typeof proto.setFromHex !== "function") {
      Object.defineProperty(proto, "setFromHex", {
        value: function (this: Uint8Array, hex: string): void {
          const clean = String(hex ?? "").trim();
          if (clean.length % 2 !== 0) throw new SyntaxError("setFromHex requires even-length hex");
          if (!/^[0-9a-fA-F]*$/.test(clean)) throw new SyntaxError("setFromHex requires hex characters");
          const n = Math.min(this.length, clean.length / 2);
          for (let i = 0; i < n; i++) this[i] = parseInt(clean.substr(i * 2, 2), 16);
        },
        writable: true,
        configurable: true,
      });
    }
  } catch {
    // Polyfill must never break the modern path.
  }
}

/** Lazy-load pdf.js in the browser with the worker served from /public. */
export function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    // Fallback branch ONLY on old engines: polyfill first, then the same import.
    if (needsLegacyPdfFallback()) installToHexPolyfill();
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      // Same worker file as before; version query only busts stale mobile caches.
      const v = (m as unknown as { version?: string }).version;
      m.GlobalWorkerOptions.workerSrc = v ? `/pdf.worker.min.mjs?v=${encodeURIComponent(v)}` : "/pdf.worker.min.mjs";
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
  // Fallback branch only: old phones OOM on wide canvases, so cap width there.
  // Modern path keeps the exact requested width (current state unchanged).
  const legacy = needsLegacyPdfFallback();
  const targetWidth = legacy ? Math.min(opts.width, 1000) : opts.width;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      if (opts.signal?.cancelled) break;
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = targetWidth / base.width;
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
