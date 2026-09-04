"use client";

import { useEffect, useRef, useState } from "react";
import { X, Calendar, Expand, FileText, ImageIcon, Paperclip, Trash2 } from "lucide-react";
import { saveNote, todayISO, type Note, type NoteAttachment } from "@/lib/store/notes";
import { Lightbox } from "@/components/ui/Lightbox";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export function NoteDialog({ open, onClose, note, onSaved }: { open: boolean; onClose: () => void; note?: Note | null; onSaved?: (n: Note) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (note) {
        setTitle(note.title);
        setDate(note.date);
        setBody(note.body);
        setAttachments(note.attachments ?? []);
      } else {
        setTitle("");
        setDate(todayISO());
        setBody("");
        setAttachments([]);
      }
    }
  }, [open, note]);

  if (!open) return null;

  const canSave = title.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const now = Date.now();
    const payload: Note = {
      id: note?.id ?? `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      date,
      body: body.trim(),
      attachments,
      createdAt: note?.createdAt ?? now,
      updatedAt: now,
    };
    saveNote(payload);
    onSaved?.(payload);
    onClose();
  };

  const onPickFiles = async (files: FileList | null, isImage: boolean) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 6 - attachments.length);
    for (const file of list) {
      if (file.size > 4 * 1024 * 1024) continue;
      const dataUrl = await fileToDataUrl(file);
      setAttachments((prev) => [
        ...prev,
        { id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`, name: file.name, type: file.type, size: file.size, dataUrl, isImage: isImage || file.type.startsWith("image/") },
      ]);
    }
    if (fileRef.current) fileRef.current.value = "";
    if (imageRef.current) imageRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-[22px] bg-white shadow-float ring-1 ring-line/40 md:rounded-[19px]">
        <div className="flex items-center justify-between px-6 py-4 md:px-5 md:py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white md:h-8 md:w-8">
              <FileText size={16} className="md:h-3.5 md:w-3.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink md:text-[13px]">{note ? "Edit note" : "New note"}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-shell text-muted transition hover:bg-line hover:text-ink md:h-7 md:w-7" aria-label="Close">
            <X size={16} className="md:h-3.5 md:w-3.5" />
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-4 md:px-5">
          <div className="flex flex-col gap-4 md:gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-tight text-ink md:text-[11px]">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Module 3 — Photosynthesis" className="field h-10 md:h-9" autoFocus />
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

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-tight text-ink md:text-[11px]">Body</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your notes…" rows={5} className="field min-h-[110px] resize-none py-3 md:min-h-[100px]" />
            </label>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-tight text-ink md:text-[11px]">Attachments</span>
                <span className="text-[11px] text-muted md:text-[10px]">{attachments.length}/6</span>
              </div>

              <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.txt,.md,.csv" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files, false)} />
              <input ref={imageRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files, true)} />

              {attachments.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="group relative flex items-center gap-2.5 rounded-xl bg-shell/60 p-2 ring-1 ring-line/50">
                      {a.isImage ? (
                        <button type="button" onClick={() => setLightbox(a.dataUrl)} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                      {a.isImage && (
                        <button type="button" onClick={() => setLightbox(a.dataUrl)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-muted ring-1 ring-line/40 transition hover:text-ink md:h-6 md:w-6" aria-label="View">
                          <Expand size={12} />
                        </button>
                      )}
                      <button type="button" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-muted ring-1 ring-line/40 transition hover:bg-white hover:text-danger md:h-6 md:w-6" aria-label="Remove">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={attachments.length >= 6} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-xs font-medium text-ink ring-1 ring-line transition hover:bg-shell disabled:opacity-40 md:py-2 md:text-[11px]">
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
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line/60 bg-shell/50 px-6 py-3 md:px-5 md:py-2.5">
          <button type="button" onClick={onClose} className="btn-secondary h-9 md:h-8">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave} className="btn-primary h-9 disabled:opacity-40 md:h-8">
            {note ? "Save" : "Create"}
          </button>
        </div>
      </div>
      <Lightbox src={lightbox} open={Boolean(lightbox)} onClose={() => setLightbox(null)} />
    </div>
  );
}
