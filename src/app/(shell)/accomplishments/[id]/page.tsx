"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Calendar, ChevronLeft, Expand, Paperclip, PhilippinePeso } from "lucide-react";
import { getAccomplishment, type Accomplishment } from "@/lib/store/accomplishments";
import { Lightbox } from "@/components/ui/Lightbox";

export default function AccomplishmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Accomplishment | null | undefined>(undefined);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    const a = getAccomplishment(params.id);
    setItem(a ?? null);
  }, [params.id]);

  if (item === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-shell p-6 text-center">
        <p className="text-sm font-semibold text-ink">Accomplishment not found</p>
        <Link href="/accomplishments" className="btn-primary">
          Back
        </Link>
      </div>
    );
  }

  if (!item) return <div className="flex h-full items-center justify-center bg-shell text-sm text-muted">Loading</div>;

  const a = item;
  const displayAttachments = a.attachments?.length ? a.attachments : a.imageDataUrl ? [{ id: "primary", name: "image", type: "image/jpeg", size: 0, dataUrl: a.imageDataUrl, isImage: true } as const] : [];

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto bg-shell">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line/20 bg-shell/90 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-shell/60 md:px-8">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-xs font-medium text-ink ring-1 ring-line/40 transition hover:bg-shell md:gap-1 md:px-3 md:py-1.5 md:text-[11px]" aria-label="Back">
          <ChevronLeft size={16} strokeWidth={2} className="md:h-3.5 md:w-3.5" />
          <span className="hidden md:inline">Back</span>
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-line/40 md:gap-1 md:px-3 md:py-1 md:text-[11px]">
          <Calendar size={12} className="md:h-3 md:w-3" />
          {new Date(a.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </span>
      </header>

      <div className="mx-auto w-full max-w-[720px] flex-1 px-6 py-8 md:px-0 md:py-8">
        <article className="overflow-hidden rounded-[24px] bg-white shadow-card ring-1 ring-line/40">
          <div className="h-1 w-full bg-ink" />
          <div className="p-6 md:p-10">
            <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-ink md:text-[26px]">{a.title}</h1>

            {a.body ? (
              <div className="prose prose-neutral mt-6 max-w-none prose-p:text-[15.5px] prose-p:leading-7 prose-p:text-ink/90 md:prose-p:text-[15px]">
                {a.body.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className="mt-4">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm leading-relaxed text-muted">No details yet — add a description.</p>
            )}

            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Budget</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-medium text-white md:text-[11px]">
                <PhilippinePeso size={12} />
                {a.budget !== null ? `₱${a.budget.toLocaleString("en-PH")}` : "No budget"}
              </span>
            </div>

            {displayAttachments.length ? (
              <div className="mt-8 border-t border-line/40 pt-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Attachments · {displayAttachments.length}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {displayAttachments.map((att) => (
                    <div key={att.id} className="group relative flex items-center justify-center overflow-hidden rounded-2xl bg-[#f9faf9] p-2 ring-1 ring-line/40">
                      {att.isImage ? (
                        <button type="button" onClick={() => setLightbox(att.dataUrl)} className="group/image relative flex h-[200px] w-full items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm md:h-[220px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={att.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
                          <span className="absolute inset-0 hidden items-center justify-center bg-ink/30 group-hover/image:flex">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink shadow-sm md:h-9 md:w-9">
                              <Expand size={16} className="md:h-3.5 md:w-3.5" />
                            </span>
                          </span>
                        </button>
                      ) : (
                        <div className="flex w-full items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-shell text-muted ring-1 ring-line">
                            <Paperclip size={14} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-ink">{att.name}</p>
                            <p className="text-[11px] text-muted">{(att.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </article>
      </div>

      <Lightbox src={lightbox} open={Boolean(lightbox)} onClose={() => setLightbox(null)} />
    </div>
  );
}
