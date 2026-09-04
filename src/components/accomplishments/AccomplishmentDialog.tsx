"use client";

import { useEffect, useRef, useState } from "react";
import { Award, Calendar, Expand, ImageIcon, Paperclip, PhilippinePeso, Trash2, X } from "lucide-react";
import { saveAccomplishment, type Accomplishment, type AccomplishmentAttachment } from "@/lib/store/accomplishments";
import { Lightbox } from "@/components/ui/Lightbox";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export function AccomplishmentDialog({ open, onClose, item, onSaved }: { open: boolean; onClose: () => void; item?: Accomplishment | null; onSaved?: (a: Accomplishment) => void }) {
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<AccomplishmentAttachment[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const formatBudget = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("en-PH");
  };

  useEffect(() => {
    if (open) {
      if (item) {
        setTitle(item.title);
        setBudget(item.budget !== null ? formatBudget(String(item.budget)) : "");
        setDate(item.date);
        setBody(item.body);
        // migrate old single image into attachments if needed
        const atts = item.attachments ?? [];
        if (item.imageDataUrl && !atts.some((a) => a.dataUrl === item.imageDataUrl)) {
          const migrated: AccomplishmentAttachment = { id: `f_mig_${Date.now().toString(36)}`, name: "image.jpg", type: "image/jpeg", size: 0, dataUrl: item.imageDataUrl, isImage: true };
          setAttachments([migrated, ...atts].slice(0, 6));
        } else {
          setAttachments(atts);
        }
      } else {
        setTitle("");
        setBudget("");
        setDate(new Date().toISOString().slice(0, 10));
        setBody("");
        setAttachments([]);
      }
    }
  }, [open, item]);

  if (!open) return null;

  const canSave = title.trim().length > 0;
  const numericBudget = budget.trim() === "" ? null : Number(budget.replace(/[^0-9]/g, ""));

  const handleSave = () => {
    if (!canSave) return;
    const now = Date.now();
    const primary = attachments.find((a) => a.isImage)?.dataUrl ?? null;
    const payload: Accomplishment = {
      id: item?.id ?? `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      budget: Number.isFinite(numericBudget as number) ? (numericBudget as number) : null,
      date,
      body: body.trim(),
      imageDataUrl: primary,
      attachments,
      createdAt: item?.createdAt ?? now,
      updatedAt: now,
    };
    saveAccomplishment(payload);
    onSaved?.(payload);
    onClose();
  };

  const onPickFiles = async (files: FileList | null, isImage: boolean) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 6 - attachments.length);
    for (const file of list) {
      if (file.size > 4 * 1024 * 1024) continue;
      const dataUrl = await fileToDataUrl(file);
      setAttachments((prev) => [...prev, { id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`, name: file.name, type: file.type, size: file.size, dataUrl, isImage: isImage || file.type.startsWith("image/") }]);
    }
    if (docRef.current) docRef.current.value = "";
    if (imageRef.current) imageRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[92dvh] w-full max-w-[580px] flex-col overflow-hidden rounded-[22px] bg-white shadow-float ring-1 ring-line/40 md:rounded-[19px]">
        <div className="flex items-center justify-between px-6 py-4 md:px-5 md:py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white md:h-8 md:w-8">
              <Award size={16} className="md:h-3.5 md:w-3.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink md:text-[13px]">{item ? "Edit accomplishment" : "New accomplishment"}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-shell text-muted transition hover:bg-line hover:text-ink md:h-7 md:w-7" aria-label="Close">
            <X size={16} className="md:h-3.5 md:w-3.5" />
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-4 md:px-5">
          <div className="flex flex-col gap-4 md:gap-3.5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-tight text-ink md:text-[11px]">Attachments</span>
                <span className="text-[11px] text-muted md:text-[10px]">{attachments.length}/6</span>
              </div>
              <input ref={docRef} type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files, false)} />
              <input ref={imageRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files, true)} />
              {attachments.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="group relative flex items-center gap-2.5 rounded-xl bg-shell/60 p-2 ring-1 ring-line/50">
                      {a.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <button type="button" onClick={() => setLightbox(a.dataUrl)} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
                          <img src={a.dataUrl} alt="" className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-muted ring-1 ring-line">
                          <Paperclip size={14} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink md:text-[11px]">{a.name}</p>
                        <p className="text-[11px] text-muted md:text-[10px]">{(a.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-muted ring-1 ring-line/40 transition hover:text-danger md:h-6 md:w-6" aria-label="Remove">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => docRef.current?.click()} disabled={attachments.length >= 6} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-medium text-ink ring-1 ring-line transition hover:bg-shell disabled:opacity-40 md:py-2 md:text-[11px]">
                  <Paperclip size={14} className="md:h-3.5 md:w-3.5" />
                  Attach file
                </button>
                <button type="button" onClick={() => imageRef.current?.click()} disabled={attachments.length >= 6} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-medium text-ink ring-1 ring-line transition hover:bg-shell disabled:opacity-40 md:py-2 md:text-[11px]">
                  <ImageIcon size={14} className="md:h-3.5 md:w-3.5" />
                  Add image
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted/70 md:text-[10px]">PDF, DOCX, images up to 4MB each</p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-tight text-ink md:text-[11px]">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Science Fair Champion" className="field h-10 md:h-9" />
            </label>

            <div className="grid grid-cols-2 gap-3 md:gap-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-tight text-ink md:text-[11px]">Budget</span>
                <div className="flex items-center gap-0 overflow-hidden rounded-xl bg-white ring-1 ring-line transition focus-within:ring-2 focus-within:ring-ink/10">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-line/60 bg-shell/50 text-muted md:h-9 md:w-9">
                    <PhilippinePeso size={14} strokeWidth={1.8} className="md:h-3.5 md:w-3.5" />
                  </span>
                  <input
                    value={budget}
                    onChange={(e) => setBudget(formatBudget(e.target.value))}
                    inputMode="numeric"
                    placeholder="5,000"
                    className="h-10 w-full border-0 bg-transparent px-3 text-sm text-ink placeholder:text-muted/40 outline-none md:h-9 md:text-[13px]"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium tracking-tight text-ink md:text-[11px]">Date</span>
                <div className="flex items-center gap-0 overflow-hidden rounded-xl bg-white ring-1 ring-line transition focus-within:ring-2 focus-within:ring-ink/10">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center border-r border-line/60 bg-shell/50 text-muted md:h-9 md:w-9">
                    <Calendar size={14} strokeWidth={1.8} className="md:h-3.5 md:w-3.5" />
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-10 w-full border-0 bg-transparent px-3 text-sm text-ink outline-none md:h-9 md:text-[13px] [&::-webkit-calendar-picker-indicator]:opacity-0"
                  />
                </div>
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-tight text-ink md:text-[11px]">Details</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe the accomplishment…" rows={4} className="field min-h-[100px] resize-none py-3 md:min-h-[90px]" />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line/60 bg-shell/50 px-6 py-3 md:px-5 md:py-2.5">
          <button type="button" onClick={onClose} className="btn-secondary h-9 md:h-8">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave} className="btn-primary h-9 disabled:opacity-40 md:h-8">
            {item ? "Save" : "Create"}
          </button>
        </div>
      </div>
      <Lightbox src={lightbox} open={Boolean(lightbox)} onClose={() => setLightbox(null)} />
    </div>
  );
}
