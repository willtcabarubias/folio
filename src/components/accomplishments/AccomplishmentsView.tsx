"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Award, Calendar, Ellipsis, Eye, Pencil, PhilippinePeso, Trash2 } from "lucide-react";
import { deleteAccomplishment, formatPeso, listAccomplishments, subscribeAccomplishments, type Accomplishment } from "@/lib/store/accomplishments";
import { AccomplishmentDialog } from "@/components/accomplishments/AccomplishmentDialog";
import { EmptyState } from "@/components/ui/EmptyState";

export function AccomplishmentsView() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [items, setItems] = useState<Accomplishment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Accomplishment | null>(null);

  useEffect(() => {
    const load = () => setItems(listAccomplishments());
    load();
    setHydrated(true);
    return subscribeAccomplishments(load);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto bg-shell">
      <header className="sticky top-0 z-10 border-b border-line/40 bg-shell/80 px-6 pb-3 pt-6 backdrop-blur md:px-5 md:pt-5 md:pb-3">
        <h1 className="text-[22px] font-semibold leading-none tracking-tight text-ink md:text-[19px]">Accomplishments</h1>
      </header>

      <div className="px-6 pb-8 pt-4 md:px-5 md:pt-4">
        {hydrated && items.length === 0 && (
          <div className="mx-auto mt-10 flex justify-center md:mt-8">
            <EmptyState description="Tap to create" onClick={() => { setEditing(null); setOpen(true); }} />
          </div>
        )}

        {visible.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-3 isolate">
            {visible.map((a) => (
              <AccomplishmentCard key={a.id} item={a} onEdit={() => { setEditing(a); setOpen(true); }} onDelete={() => { if (window.confirm(`Delete “${a.title}”?`)) deleteAccomplishment(a.id); }} />
            ))}
          </div>
        )}
        {hydrated && items.length > 0 && visible.length === 0 && <p className="mt-10 text-center text-sm text-muted">No matches</p>}
      </div>

      <AccomplishmentDialog open={open} onClose={() => setOpen(false)} item={editing} onSaved={() => setEditing(null)} />
    </div>
  );
}

function AccomplishmentCard({ item: a, onEdit, onDelete }: { item: Accomplishment; onEdit: () => void; onDelete: () => void }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <article onClick={() => router.push(`/accomplishments/${a.id}`)} className={`card group relative flex cursor-pointer flex-col p-4 transition hover:shadow-float md:p-3.5 ${menuOpen ? "z-20" : "z-0"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-ink md:h-7 md:w-7">
          <Award size={14} className="md:h-3 md:w-3" />
        </span>
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-shell px-2 py-0.5 text-[10px] font-medium text-muted ring-1 ring-line/40 md:px-1.5 md:text-[9px]">
            <Calendar size={10} className="md:h-3 md:w-3" />
            {new Date(a.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Actions" aria-expanded={menuOpen} aria-haspopup="menu" className={`flex h-7 w-7 items-center justify-center rounded-full transition md:h-6 md:w-6 ${menuOpen ? "bg-ink text-white" : "text-muted hover:bg-shell hover:text-ink"}`}>
              <Ellipsis size={14} strokeWidth={1.9} className="md:h-3 md:w-3" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-[50] mt-1.5 w-44 overflow-hidden rounded-xl bg-white p-1 shadow-float ring-1 ring-line/40" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); router.push(`/accomplishments/${a.id}`); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink transition hover:bg-shell md:text-[11px]">
                  <Eye size={14} className="text-muted md:h-3 md:w-3" />
                  View
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink transition hover:bg-shell md:text-[11px]">
                  <Pencil size={14} className="text-muted md:h-3 md:w-3" />
                  Edit
                </button>
                <div className="my-1 border-t border-line/40" />
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-danger transition hover:bg-red-50 md:text-[11px]">
                  <Trash2 size={14} className="md:h-3 md:w-3" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <h3 className="mt-3 line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-ink md:text-xs">{a.title}</h3>

      {a.attachments?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {a.attachments.slice(0, 3).map((att) => (
            <span key={att.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-muted ring-1 ring-line/40 md:px-1.5 md:text-[9px]">
              {att.isImage ? <Award size={10} className="md:h-3 md:w-3" /> : <Award size={10} className="md:h-3 md:w-3" />}
              <span className="max-w-[70px] truncate">{att.name}</span>
            </span>
          ))}
          {a.attachments.length > 3 && <span className="inline-flex h-5 items-center rounded-full bg-ink px-1.5 text-[10px] font-medium text-white md:h-4 md:text-[9px]">+{a.attachments.length - 3}</span>}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-1.5 border-t border-line/40 pt-2.5 md:mt-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        <span className="text-[11px] font-medium tracking-tight text-muted md:text-[10px]">{formatPeso(a.budget)}</span>
        <span className="ml-auto text-[11px] text-muted/60 md:text-[10px]">{a.attachments?.length ? `${a.attachments.length} files` : ""}</span>
      </div>
    </article>
  );
}
