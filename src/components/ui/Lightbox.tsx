"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export function Lightbox({ src, alt, open, onClose }: { src: string | null; alt?: string; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/80 backdrop-blur-sm" />
      <div className="relative flex max-h-[92vh] max-w-[92vw] flex-col items-center">
        <button type="button" onClick={onClose} className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink shadow-sm ring-1 ring-line/40 transition hover:bg-shell md:h-7 md:w-7" aria-label="Close">
          <X size={16} className="md:h-3.5 md:w-3.5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? ""} className="max-h-[88vh] max-w-[92vw] rounded-2xl object-contain shadow-float ring-1 ring-white/20" />
      </div>
    </div>
  );
}
