"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, Ellipsis, FileText, Layers, Loader2, Presentation, Trash2 } from "lucide-react";
import { downloadBlob, renderFile } from "@/lib/client/api";
import type { Format } from "@/lib/spec/types";
import { deleteProject, listProjects, subscribe, type Project } from "@/lib/store/projects";
import { EmptyState } from "@/components/ui/EmptyState";

type Filter = "all" | Format;

const STATUS_LABEL: Record<Project["status"], string> = { planning: "Planning", draft: "Outline", generated: "Generated" };

export function LibraryView() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = () => setProjects(listProjects().filter((p) => p.status === "generated" && Boolean(p.spec)));
    load();
    setHydrated(true);
    return subscribe(() => setProjects(listProjects().filter((p) => p.status === "generated" && Boolean(p.spec))));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => (filter === "all" || p.format === filter) && (!q || p.title.toLowerCase().includes(q) || p.docType.toLowerCase().includes(q)));
  }, [projects, query, filter]);

  const download = async (p: Project, format: Format) => {
    if (!p.spec) return;
    setDownloading(`${p.id}:${format}`);
    setError(null);
    try {
      const { blob, fileName } = await renderFile({ ...p.spec, title: p.title || p.spec.title }, format);
      downloadBlob(blob, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  const remove = (p: Project) => {
    if (window.confirm(`Delete “${p.title}”?`)) deleteProject(p.id);
  };

  const counts = {
    all: projects.length,
    pptx: projects.filter((p) => p.format === "pptx").length,
    docx: projects.filter((p) => p.format === "docx").length,
    pdf: projects.filter((p) => p.format === "pdf").length,
  };

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto bg-shell">
      <header className="sticky top-0 z-10 border-b border-line/40 bg-shell/80 px-6 pb-4 pt-6 backdrop-blur md:px-5 md:pt-5 md:pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[22px] font-semibold leading-none tracking-tight text-ink md:text-[19px]">Library</h1>
          <div className="flex items-center gap-1 rounded-full bg-[#f0f3f0] p-1 ring-1 ring-line/40">
            {([
              { id: "all" as Filter, label: "All", icon: Layers },
              { id: "pptx" as Filter, label: "Slides", icon: Presentation },
              { id: "docx" as Filter, label: "Word", icon: FileText },
              { id: "pdf" as Filter, label: "PDF", icon: FileText },
            ] as const).map(({ id, label, icon: Icon }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium tracking-tight transition md:gap-1 md:px-3 md:py-1 md:text-[11px] ${active ? "bg-white text-ink shadow-sm ring-1 ring-line/30" : "text-muted hover:text-ink"}`}
                >
                  <Icon size={12} strokeWidth={1.9} className={`${active ? "text-ink" : "text-muted/60"} md:h-[11px] md:w-[11px]`} />
                  {label}
                  <span className={`ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-semibold leading-none md:text-[9px] ${active ? "bg-ink text-white" : "bg-white text-muted ring-1 ring-line/40"}`}>{counts[id]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="px-6 pb-8 pt-4 md:px-5 md:pt-4">
        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger ring-1 ring-red-100 md:px-3 md:py-2 md:text-xs">{error}</p>}

        {hydrated && projects.length === 0 && (
          <div className="mx-auto mt-10 flex justify-center md:mt-8">
            <EmptyState description="Tap to create" href="/" />
          </div>
        )}

        {visible.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-3 isolate">
            {visible.map((p) => (
              <ProjectCard key={p.id} project={p} downloading={downloading} onDownload={download} onDelete={remove} />
            ))}
          </div>
        )}
        {hydrated && projects.length > 0 && visible.length === 0 && <p className="mt-10 text-center text-sm text-muted md:mt-8 md:text-xs">No matches</p>}
      </div>
    </div>
  );
}

function ProjectCard({ project: p, downloading, onDownload, onDelete }: { project: Project; downloading: string | null; onDownload: (p: Project, f: Format) => void; onDelete: (p: Project) => void }) {
  const router = useRouter();
  const date = new Date(p.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const pages = p.spec?.fit?.pages;
  const formats: Format[] = ["pptx", "docx", "pdf"];
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
    <article
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/studio/${p.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/studio/${p.id}`);
        }
      }}
      className={`card group relative flex cursor-pointer flex-col p-4 transition hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 md:p-3.5 ${menuOpen ? "z-20" : "z-0"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-[10px] font-bold uppercase tracking-wide text-white md:h-7 md:w-7 md:rounded-md md:text-[9px]">
          {p.format}
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-shell px-2 py-0.5 text-[10px] font-medium tracking-tight text-muted ring-1 ring-line/40 md:px-1.5 md:text-[9px]">{date}</span>
          <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              aria-label="Actions"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className={`flex h-7 w-7 items-center justify-center rounded-full transition md:h-6 md:w-6 ${menuOpen ? "bg-ink text-white" : "text-muted hover:bg-shell hover:text-ink"}`}
            >
              <Ellipsis size={14} strokeWidth={1.9} className="md:h-3 md:w-3" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-[50] mt-1.5 w-44 overflow-hidden rounded-xl bg-white p-1 shadow-float ring-1 ring-line/40" role="menu">
                <Link
                  href={`/studio/${p.id}`}
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink transition hover:bg-shell md:text-[11px]"
                >
                  <ArrowUpRight size={14} className="text-muted md:h-3 md:w-3" />
                  Open
                </Link>
                <div className="my-1 border-t border-line/40" />
                {formats.map((f) => {
                  const busy = downloading === `${p.id}:${f}`;
                  return (
                    <button
                      key={f}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onDownload(p, f);
                      }}
                      disabled={busy}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-ink transition hover:bg-shell disabled:opacity-50 md:text-[11px]"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin text-muted md:h-3 md:w-3" /> : <Download size={14} className="text-muted md:h-3 md:w-3" />}
                      Download {f.toUpperCase()}
                    </button>
                  );
                })}
                <div className="my-1 border-t border-line/40" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(p);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-danger transition hover:bg-red-50 md:text-[11px]"
                >
                  <Trash2 size={14} className="md:h-3 md:w-3" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <h2 className="mt-3 line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-ink md:text-xs">{p.title || "Untitled"}</h2>
      <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-muted md:text-[10.5px]">
        {p.docType ? <span className="capitalize">{p.docType} · </span> : null}
        {p.sectionCount ? `${p.sectionCount} ${p.format === "pptx" ? "slides" : "sections"} · ` : ""}
        {pages ? `${pages} pg · ` : ""}
        {p.status === "generated" ? "Ready" : STATUS_LABEL[p.status]}
      </p>

      <div className="mt-3 flex items-center gap-1.5 border-t border-line/40 pt-3 md:mt-2.5 md:pt-2.5">
        <span className={`h-1.5 w-1.5 rounded-full ${p.status === "generated" ? "bg-success" : "bg-line"}`} />
        <span className="text-[11px] font-medium tracking-tight text-muted md:text-[10px]">{p.docType || p.format.toUpperCase()}</span>
        <span className="ml-auto text-[11px] text-muted/60 md:text-[10px]">{p.sourceFiles[0]?.split(".").pop()?.toUpperCase() || ""}</span>
      </div>
    </article>
  );
}
