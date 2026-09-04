"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { rasterizePdf } from "@/lib/client/pdf";

type PageImage = { url: string; width: number; height: number };

type Props = {
  data: ArrayBuffer | null;
  kind: "slides" | "pages";
  busy?: boolean;
  busyLabel?: string;
  emptyTitle?: string;
  emptyHint?: string;
};

export function PdfPreview({ data, kind, busy, busyLabel, emptyTitle, emptyHint }: Props) {
  const [pages, setPages] = useState<PageImage[]>([]);
  const [total, setTotal] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) {
      setPages([]);
      setTotal(0);
      return;
    }
    const signal = { cancelled: false };
    const urls: string[] = [];
    const acc: PageImage[] = [];
    setPages([]);
    setError(null);
    setRendering(true);
    rasterizePdf(data, {
      width: kind === "slides" ? 1600 : 1240,
      type: "image/jpeg",
      quality: 0.92,
      signal,
      onPage: (i, n, page) => {
        if (signal.cancelled) return;
        const url = URL.createObjectURL(page.blob);
        urls.push(url);
        acc.push({ url, width: page.width, height: page.height });
        setTotal(n);
        setPages([...acc]);
      },
    })
      .catch((err: unknown) => {
        if (!signal.cancelled) setError(err instanceof Error ? err.message : "Preview failed");
      })
      .finally(() => {
        if (!signal.cancelled) setRendering(false);
      });
    return () => {
      signal.cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [data, kind]);

  if (busy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10">
        <div className={`w-full max-w-2xl ${kind === "slides" ? "aspect-video" : "aspect-[1/1.3] max-w-md"} shimmer rounded-xl`} />
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={15} className="animate-spin text-brand" />
          {busyLabel ?? "Working"}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-ink ring-1 ring-line">
          <FileText size={20} />
        </div>
        <p className="mt-4 text-[15px] font-semibold text-ink">{emptyTitle ?? "No preview yet"}</p>
        <p className="mt-1 max-w-sm text-sm text-muted">{emptyHint ?? "Generate to write the content and render the document."}</p>
      </div>
    );
  }

  return (
    <div className="scroll-thin h-full overflow-y-auto px-4 py-6 md:px-8">
      {error && <p className="mx-auto mb-4 max-w-3xl rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-danger ring-1 ring-red-100">{error}</p>}
      <div className={`mx-auto flex flex-col gap-6 ${kind === "slides" ? "max-w-4xl" : "max-w-[820px]"}`}>
        {pages.map((p, i) => (
          <figure key={p.url} className="animate-rise">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={`${kind === "slides" ? "Slide" : "Page"} ${i + 1}`} width={p.width} height={p.height} className="h-auto w-full rounded-lg bg-white shadow-[0_18px_50px_-24px_rgba(20,40,90,0.45)] ring-1 ring-black/5" />
            <figcaption className="mt-2 text-center text-[11px] font-medium text-muted">
              {kind === "slides" ? "Slide" : "Page"} {i + 1}
              {total ? ` of ${total}` : ""}
            </figcaption>
          </figure>
        ))}
        {rendering && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
            <Loader2 size={15} className="animate-spin text-brand" />
            Rendering {pages.length + 1}
            {total ? ` of ${total}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
