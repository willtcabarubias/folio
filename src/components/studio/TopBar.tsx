"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Download, FileImage, FileText, House, LayoutList, Link2, Loader2, Presentation, Save, ScanEye, Share2, Type } from "lucide-react";

export type ExportKind = "pptx" | "docx" | "pdf" | "png" | "md";
export type ShareKind = "link" | "file" | "text";
export type SaveState = "saved" | "dirty" | "saving";

type Props = {
  title: string;
  onTitleChange: (v: string) => void;
  saveState: SaveState;
  onSave: () => void;
  canExport: boolean;
  exporting: ExportKind | null;
  onExport: (kind: ExportKind) => void;
  onShare: (kind: ShareKind) => void;
  canShareFile: boolean;
  status?: ReactNode;
  isPlanning?: boolean;
  isBusy?: boolean;
  centerLabel?: "Outline" | "Preview";
};

export function TopBar({ title, onTitleChange, saveState, onSave, canExport, exporting, onExport, onShare, canShareFile, status, isPlanning, isBusy, centerLabel }: Props) {
  if (isPlanning) {
    return (
      <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line/40 bg-white px-3 backdrop-blur md:h-12 md:px-4">
        <Link href="/" aria-label="Folio home" className="flex items-center">
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden className="shrink-0 md:h-[19px] md:w-[19px]">
            <path d="M6 5h20v6H12v4h11v6H12v6H6V5z" fill="#0F1410" />
            <circle cx="25" cy="24" r="3.5" fill="#111311" />
          </svg>
        </Link>
        <Link
          href="/"
          aria-label="Home"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-[#f4f6f4] md:h-[32px] md:w-[32px]"
        >
          <House size={18} className="md:h-4 md:w-4" />
        </Link>
      </header>
    );
  }

  const showActions = canExport;
  const busy = Boolean(isBusy);

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line/40 bg-white px-3 backdrop-blur md:h-12 md:px-4">
      <div className="flex min-w-0 items-center gap-2 md:gap-1.5">
        <Link
          href="/"
          aria-label="Home"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-[#f4f6f4] md:h-[32px] md:w-[32px]"
        >
          <House size={18} className="md:h-4 md:w-4" />
        </Link>
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden className="hidden shrink-0 sm:block md:h-[19px] md:w-[19px]">
          <path d="M6 5h20v6H12v4h11v6H12v6H6V5z" fill="#0F1410" />
          <circle cx="25" cy="24" r="3.5" fill="#111311" />
        </svg>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          aria-label="Project title"
          className="min-w-0 max-w-[46vw] truncate rounded-lg border-0 bg-transparent px-2 py-1 text-[15px] font-semibold tracking-tight text-ink outline-none ring-ink/10 transition hover:bg-[#f4f6f4] focus:bg-white focus:ring-2 sm:max-w-xs md:max-w-md md:px-1.5 md:py-0.5 md:text-[13px]"
        />
      </div>

      {centerLabel && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium tracking-wide text-ink shadow-sm ring-1 ring-line md:px-2.5 md:py-1 md:text-[11px]">
            {centerLabel === "Outline" ? <LayoutList size={13} className="text-ink md:h-3 md:w-3" /> : <ScanEye size={13} className="text-ink md:h-3 md:w-3" />}
            {centerLabel}
          </span>
        </div>
      )}
      {/* mobile center label — shows below 768 as subtle text to avoid crowding title */}
      {centerLabel && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 md:hidden">
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium tracking-wide text-ink ring-1 ring-line">{centerLabel}</span>
        </div>
      )}

      {showActions && (
        <div className="flex shrink-0 items-center gap-1.5 md:gap-1">
          {status && <span className="hidden md:inline-flex">{status}</span>}
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="btn-secondary h-9 px-3 disabled:cursor-not-allowed disabled:opacity-50 md:h-[31px] md:px-2.5 md:text-xs"
            title={busy ? "File is updating — please wait" : "Save to library"}
          >
            <Save size={15} className="md:h-3.5 md:w-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>
          <Menu
            label={
              <>
                <Share2 size={15} className="md:h-3.5 md:w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </>
            }
            className="btn-secondary h-9 px-3 md:h-[31px] md:px-2.5 md:text-xs"
            disabled={busy}
          >
            <MenuItem icon={<Link2 size={15} />} label="Copy link" hint={busy ? "File is updating — please wait" : "Opens this project in this browser"} disabled={busy} onClick={() => onShare("link")} />
            <MenuItem icon={<Share2 size={15} />} label="Share file…" hint={busy ? "File is updating — please wait" : canShareFile ? "Send the PDF with your device" : "Generate first"} disabled={busy || !canShareFile} onClick={() => onShare("file")} />
            <MenuItem icon={<Copy size={15} />} label="Copy as text" hint={busy ? "File is updating — please wait" : "Outline or content as Markdown"} disabled={busy} onClick={() => onShare("text")} />
          </Menu>
          <Menu
            label={
              <>
                {exporting ? <Loader2 size={15} className="animate-spin md:h-3.5 md:w-3.5" /> : <Download size={15} className="md:h-3.5 md:w-3.5" />}
                <span>Export</span>
                <ChevronDown size={14} className="opacity-70 md:h-3 md:w-3" />
              </>
            }
            className="btn-primary h-9 px-3.5 disabled:cursor-not-allowed disabled:opacity-60 md:h-[31px] md:px-3 md:text-xs"
            disabled={busy || Boolean(exporting)}
          >
            {busy ? (
              <p className="px-3 pb-2 pt-1 text-xs text-muted md:text-[11px]">File is updating — export will be available when ready.</p>
            ) : (
              !canExport && <p className="px-3 pb-2 pt-1 text-xs text-muted md:text-[11px]">Generate the document first.</p>
            )}
            <MenuItem icon={<Presentation size={15} />} label="PowerPoint" hint=".pptx" disabled={!canExport || Boolean(exporting) || busy} onClick={() => onExport("pptx")} />
            <MenuItem icon={<FileText size={15} />} label="Word" hint=".docx" disabled={!canExport || Boolean(exporting) || busy} onClick={() => onExport("docx")} />
            <MenuItem icon={<FileText size={15} />} label="PDF" hint=".pdf" disabled={!canExport || Boolean(exporting) || busy} onClick={() => onExport("pdf")} />
            <div className="my-1 border-t border-line" />
            <MenuItem icon={<FileImage size={15} />} label="Images" hint=".png — one per page, zipped" disabled={!canExport || Boolean(exporting) || busy} onClick={() => onExport("png")} />
            <MenuItem icon={<Type size={15} />} label="Markdown" hint=".md" disabled={!canExport || Boolean(exporting) || busy} onClick={() => onExport("md")} />
          </Menu>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */

export function Menu({ label, className, children, align = "right", disabled }: { label: ReactNode; className?: string; children: ReactNode; align?: "left" | "right"; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        className={`${className ?? ""} ${disabled ? "cursor-not-allowed opacity-60" : ""}`.trim()}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-1.5 w-64 rounded-2xl bg-white p-1.5 shadow-float ring-1 ring-line animate-rise md:w-56 md:rounded-xl md:p-1 ${align === "right" ? "right-0" : "left-0"}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, label, hint, disabled, onClick }: { icon: ReactNode; label: string; hint?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        if (disabled) {
          e.stopPropagation();
          return;
        }
        onClick();
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-ink transition hover:bg-[#f4f6f4] disabled:cursor-not-allowed disabled:opacity-40 md:gap-2.5 md:px-2.5 md:py-1.5 md:text-xs"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f4f6f4] text-ink md:h-6 md:w-6">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium tracking-tight">{label}</span>
        {hint && <span className="block truncate text-xs text-muted md:text-[11px]">{hint}</span>}
      </span>
    </button>
  );
}
