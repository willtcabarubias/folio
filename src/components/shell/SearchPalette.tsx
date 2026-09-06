"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Clock3,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  Inbox,
  LineChart,
  Megaphone,
  Presentation,
  Search,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { listProjects, subscribe, type Project } from "@/lib/store/projects";

// Quick starts — mirrored from HomeView for hybrid actions
const QUICK_STARTS = [
  { icon: Presentation, label: "Pitch deck", prompt: "Create a pitch deck for ", keywords: "pitch deck presentation slides" },
  { icon: GraduationCap, label: "Lesson", prompt: "Create a lesson presentation for my class about ", keywords: "lesson education teaching class" },
  { icon: FileText, label: "Report", prompt: "Write a structured report on ", keywords: "report document structured" },
  { icon: UserRound, label: "Resume", prompt: "Make me a one-page resume for a ", keywords: "resume cv one-page" },
  { icon: Briefcase, label: "Proposal", prompt: "Draft a project proposal for ", keywords: "proposal project draft" },
  { icon: BookOpen, label: "Study guide", prompt: "Make a study guide covering ", keywords: "study guide learning notes" },
  { icon: FileText, label: "Reaction paper", prompt: "Write a reaction paper about ", keywords: "reaction paper reflection response opinion" },
  { icon: FileText, label: "Lab report", prompt: "Write a lab report with Aim, Method, Results and Discussion for ", keywords: "lab report experiment investigatory science" },
  { icon: LineChart, label: "Business plan", prompt: "Write a business plan for ", keywords: "business plan strategy" },
  { icon: Megaphone, label: "Marketing plan", prompt: "Create a marketing plan for ", keywords: "marketing plan campaign" },
] as const;

type NavItem = { label: string; href: string; icon: React.ComponentType<{ size: number; className?: string }>; keywords: string };
const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home, keywords: "home dashboard start" },
  { label: "Library", href: "/library", icon: FolderOpen, keywords: "library projects archive" },
  { label: "Settings", href: "/settings", icon: Settings, keywords: "settings preferences account workspace" },
  { label: "New project", href: "/", icon: Sparkles, keywords: "new create start project" },
];

type PaletteItem = {
  id: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  group: "recent" | "project" | "page" | "action";
  onSelect: () => void;
};

function norm(s: string) {
  return s.toLowerCase().trim();
}
function includes(hay: string, needle: string) {
  return norm(hay).includes(norm(needle));
}
function score(hay: string, needle: string) {
  const h = norm(hay);
  const n = norm(needle);
  if (!n) return 0;
  if (h.startsWith(n)) return 2;
  if (h.includes(n)) return 1;
  return 0;
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load projects client-only
  useEffect(() => {
    const load = () => setProjects(listProjects());
    load();
    return subscribe(load);
  }, []);

  // Autofocus + reset
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // slight delay for mount animation
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Esc at document level
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const recent = useMemo(() => projects.slice(0, 3), [projects]);

  const groups = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const recentItems: PaletteItem[] = recent.map((p) => ({
        id: `recent-${p.id}`,
        label: p.title || "Untitled",
        sub: `${p.format.toUpperCase()} · ${p.status === "generated" ? "Generated" : p.status === "draft" ? "Outline" : "Planning"} · ${new Date(p.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
        icon: <FileText size={14} className="text-muted" />,
        group: "recent",
        onSelect: () => {
          onClose();
          router.push(`/studio/${p.id}`);
        },
      }));

      const pageItems: PaletteItem[] = NAV_ITEMS.map((n) => ({
        id: `page-${n.label}`,
        label: n.label,
        sub: n.href,
        icon: <n.icon size={14} className="text-muted" />,
        group: "page",
        onSelect: () => {
          onClose();
          router.push(n.href);
        },
      }));

      const actionItems: PaletteItem[] = QUICK_STARTS.slice(0, 5).map((q) => ({
        id: `action-${q.label}`,
        label: q.label,
        sub: q.prompt,
        icon: <q.icon size={14} className="text-muted" />,
        group: "action",
        onSelect: () => {
          onClose();
          router.push(`/?prompt=${encodeURIComponent(q.prompt)}`);
        },
      }));

      return [
        { key: "recent", title: "Recent", items: recentItems },
        { key: "pages", title: "Go to", items: pageItems },
        { key: "actions", title: "Create", items: actionItems },
      ].filter((g) => g.items.length > 0);
    }

    // Filtered mode
    const ql = norm(q);

    const projectItems: PaletteItem[] = projects
      .map((p) => {
        const hay = `${p.title} ${p.docType} ${p.format} ${p.sourceFiles.join(" ")}`;
        const s = Math.max(score(p.title, ql), score(hay, ql) * 0.8);
        return { p, s, hay };
      })
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map(({ p }) => ({
        id: `project-${p.id}`,
        label: p.title || "Untitled",
        sub: `${p.format.toUpperCase()} · ${p.docType || "—"} · ${p.sourceFiles.slice(0, 2).join(", ") || "No sources"}`,
        icon: (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-[10px] font-bold uppercase text-white md:h-6 md:w-6">
            {p.format}
          </span>
        ),
        group: "project" as const,
        onSelect: () => {
          onClose();
          router.push(`/studio/${p.id}`);
        },
      }));

    const pageItems: PaletteItem[] = NAV_ITEMS.filter((n) => includes(`${n.label} ${n.keywords} ${n.href}`, ql)).map((n) => ({
      id: `page-${n.label}`,
      label: n.label,
      sub: n.href,
      icon: <n.icon size={14} className="text-muted" />,
      group: "page",
      onSelect: () => {
        onClose();
        router.push(n.href);
      },
    }));

    const actionItems: PaletteItem[] = QUICK_STARTS.filter((a) => includes(`${a.label} ${a.prompt} ${a.keywords}`, ql)).map((a) => ({
      id: `action-${a.label}`,
      label: a.label,
      sub: a.prompt,
      icon: <a.icon size={14} className="text-muted" />,
      group: "action",
      onSelect: () => {
        onClose();
        router.push(`/?prompt=${encodeURIComponent(a.prompt)}`);
      },
    }));

    const out: { key: string; title: string; items: PaletteItem[] }[] = [];
    if (projectItems.length) out.push({ key: "projects", title: `Projects · ${projectItems.length}`, items: projectItems });
    if (pageItems.length) out.push({ key: "pages", title: "Pages", items: pageItems });
    if (actionItems.length) out.push({ key: "actions", title: "Actions", items: actionItems });
    return out;
  }, [query, recent, projects, router, onClose]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  // include "search in library" as virtual item when query non-empty
  const hasLibraryRow = query.trim().length > 0;
  const totalLen = flat.length + (hasLibraryRow ? 1 : 0);

  // Clamp active
  useEffect(() => {
    if (active >= totalLen) setActive(Math.max(0, totalLen - 1));
  }, [active, totalLen]);

  // Keep active visible
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(1, totalLen));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + totalLen) % Math.max(1, totalLen));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) flat[active].onSelect();
      else if (hasLibraryRow && active === flat.length) {
        onClose();
        router.push(`/library?q=${encodeURIComponent(query.trim())}`);
      } else if (hasLibraryRow && flat.length === 0) {
        onClose();
        router.push(`/library?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  if (!open) return null;

  const libraryActive = hasLibraryRow && active === flat.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] md:p-6 md:pt-[12vh]">
      {/* Backdrop */}
      <button type="button" aria-label="Close search" onClick={onClose} className="absolute inset-0 bg-[#0f1410]/20 backdrop-blur-[2px]" />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative flex max-h-[min(560px,78vh)] w-full max-w-[640px] flex-col overflow-hidden rounded-[20px] bg-white shadow-float ring-1 ring-line/60 animate-rise md:max-w-[600px] md:rounded-[16px]"
        onKeyDown={onKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-line/40 px-4 py-3 md:px-3 md:py-2.5">
          <Search size={16} className="shrink-0 text-muted md:h-[14px] md:w-[14px]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search projects, pages, actions…"
            aria-label="Search"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted/60 outline-none md:text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActive(0);
                inputRef.current?.focus();
              }}
              aria-label="Clear"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f4f6f4] text-muted hover:text-ink md:h-6 md:w-6"
            >
              <X size={14} className="md:h-3 md:w-3" />
            </button>
          ) : (
            <span className="hidden items-center gap-1 rounded bg-[#f4f6f4] px-1.5 py-1 text-[10px] font-medium tracking-wide text-muted ring-1 ring-line/40 md:inline-flex">
              ⌘K
            </span>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="scroll-thin flex-1 overflow-y-auto p-2">
          {groups.length === 0 && !hasLibraryRow ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4f6f4] text-muted md:h-9 md:w-9">
                <Inbox size={18} />
              </span>
              <p className="mt-3 text-sm font-medium text-ink md:text-xs">No results for “{query}”</p>
              <p className="mt-1 text-xs leading-relaxed text-muted md:text-[11px]">Try a different keyword or create a new project.</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/?prompt=${encodeURIComponent(query)}`);
                }}
                className="btn-primary mt-4 h-9 px-4 md:h-[31px] md:text-xs"
              >
                <Sparkles size={14} className="md:h-3 md:w-3" />
                Create with “{query.slice(0, 24)}”
              </button>
            </div>
          ) : (
            <div className="space-y-3 md:space-y-2.5">
              {groups.map((g) => (
                <div key={g.key}>
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted/70 md:px-2.5">{g.title}</p>
                  <ul className="space-y-1">
                    {g.items.map((item) => {
                      const idx = flat.indexOf(item);
                      const isActive = idx === active;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            data-idx={idx}
                            onClick={item.onSelect}
                            onMouseEnter={() => setActive(idx)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition md:gap-2.5 md:px-2.5 md:py-2 ${isActive ? "bg-ink text-white" : "hover:bg-[#f7f8f7] text-ink"}`}
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-6 md:w-6 ${isActive ? "bg-white/15 text-white" : "bg-[#f4f6f4] text-ink"}`}
                            >
                              {item.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm font-medium tracking-tight md:text-xs ${isActive ? "text-white" : "text-ink"}`}>{item.label}</span>
                              <span className={`block truncate text-xs md:text-[11px] ${isActive ? "text-white/70" : "text-muted"}`}>{item.sub}</span>
                            </span>
                            <span className={`hidden shrink-0 items-center gap-1 text-xs md:flex ${isActive ? "text-white/60" : "text-muted"}`}>
                              {item.group === "recent" && <Clock3 size={12} />}
                              {(item.group === "project" || item.group === "recent") && <ArrowUpRight size={12} />}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {/* Hybrid library search row */}
              {hasLibraryRow && (
                <div>
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted/70 md:px-2.5">Library</p>
                  <button
                    type="button"
                    data-idx={flat.length}
                    onClick={() => {
                      onClose();
                      router.push(`/library?q=${encodeURIComponent(query.trim())}`);
                    }}
                    onMouseEnter={() => setActive(flat.length)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition md:gap-2.5 md:px-2.5 md:py-2 ${libraryActive ? "bg-ink text-white" : "hover:bg-[#f7f8f7] text-ink"}`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-6 md:w-6 ${libraryActive ? "bg-white/15 text-white" : "bg-[#f4f6f4] text-ink"}`}>
                      <Search size={14} className={libraryActive ? "text-white" : "text-muted"} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium md:text-xs ${libraryActive ? "text-white" : "text-ink"}`}>Search “{query.trim().slice(0, 32)}” in Library</span>
                      <span className={`block text-xs md:text-[11px] ${libraryActive ? "text-white/70" : "text-muted"}`}>Filter projects by title, type, sources</span>
                    </span>
                    <ArrowUpRight size={12} className={libraryActive ? "text-white/60" : "text-muted"} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line/40 bg-[#fcfdfc] px-4 py-2.5 md:px-3 md:py-2">
          <span className="hidden items-center gap-2 text-[11px] text-muted md:flex">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-line">↑↓</kbd> Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-line">Enter</kbd> Select
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-line">Esc</kbd> Close
            </span>
          </span>
          <span className="text-[11px] text-muted md:text-[10px]">{totalLen} results</span>
          <span className="text-[11px] text-muted md:hidden">Esc to close</span>
        </div>
      </div>
    </div>
  );
}


