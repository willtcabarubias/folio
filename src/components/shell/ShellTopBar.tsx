"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Award, Bell, FolderOpen, Inbox, LogOut, Menu, NotebookPen, Plus, Search, Settings, Sparkles, UserRound, X } from "lucide-react";
import { SearchPalette } from "./SearchPalette";
import { Tooltip } from "./Tooltip";
import { NoteDialog } from "@/components/notes/NoteDialog";
import { AccomplishmentDialog } from "@/components/accomplishments/AccomplishmentDialog";

type Notification = {
  id: string;
  title: string;
  time: string;
  read?: boolean;
};

const MOCK_NOTIFICATIONS: Notification[] = [];

function Logo() {
  return (
    <Link href="/" aria-label="Folio home" className="flex h-11 w-11 items-center justify-center rounded-2xl md:hidden md:h-8 md:w-8">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden className="h-[32px] w-[32px] md:h-[22px] md:w-[22px]">
        <path d="M6 5h20v6H12v4h11v6H12v6H6V5z" fill="#0F1410" />
        <circle cx="25" cy="24" r="3.5" fill="#111311" />
      </svg>
    </Link>
  );
}

const NAV = [
  { href: "/", label: "Home", icon: Sparkles },
  { href: "/library", label: "Library", icon: FolderOpen },
  { href: "/notes", label: "Notes", icon: Sparkles },
  { href: "/accomplishments", label: "Accomplishments", icon: Sparkles },
] as const;

export function ShellTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);

  // Scroll hybrid bg — transparent at top, subtle white on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Prevent body scroll when drawer open
  useEffect(() => {
    if (drawerOpen || paletteOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen, paletteOpen]);

  // Global shortcut Cmd+K / Ctrl+K and "/"
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
      const target = e.target as HTMLElement | null;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isCmdK) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        setNotifOpen(false);
        setDrawerOpen(false);
      } else if (isSlash && !isTyping && !paletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, drawerOpen]);

  // Close dropdowns on outside click / Esc
  useEffect(() => {
    if (!notifOpen && !plusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotifOpen(false);
        setPlusOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen, plusOpen]);

  const hasNotifications = MOCK_NOTIFICATIONS.length > 0;
  const unread = MOCK_NOTIFICATIONS.filter((n) => !n.read).length;

  return (
    <>
      <header
        className={`flex h-14 shrink-0 items-center gap-4 px-4 md:h-12 md:gap-3 md:px-5 ${scrolled ? "border-b border-line/20 bg-white/70 backdrop-blur" : "border-b border-transparent bg-transparent"}`}
      >
        {/* Left: Logo (mobile only — desktop logo is in Sidebar with bigger size) */}
        <div className="flex items-center gap-4 md:hidden">
          <Logo />
        </div>

        <div className="flex-1" aria-hidden />

        {/* Desktop actions — Settings moved to Sidebar, keep Search here */}
        <div className="hidden shrink-0 items-center gap-1 md:flex md:gap-1.5">
          <Tooltip label="Search">
            <button
              type="button"
              onClick={() => {
                setPaletteOpen(true);
                setNotifOpen(false);
              }}
              aria-label="Search"
              aria-haspopup="dialog"
              aria-expanded={paletteOpen}
              title="Search (⌘K)"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-white/60 hover:text-ink md:h-[32px] md:w-[32px]"
            >
              <Search size={17} strokeWidth={1.9} className="md:h-[15px] md:w-[15px]" />
            </button>
          </Tooltip>

          <div ref={notifRef} className="relative">
            <Tooltip label="Notifications">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                }}
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={notifOpen}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-white/60 hover:text-ink md:h-[32px] md:w-[32px]"
              >
                <Bell size={17} strokeWidth={1.75} className="md:h-[15px] md:w-[15px]" />
                {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ink ring-2 ring-white md:h-1.5 md:w-1.5" aria-hidden />}
              </button>
            </Tooltip>

            {notifOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-[20px] bg-white p-1 shadow-float ring-1 ring-line animate-rise md:w-[300px] md:rounded-[16px]"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm font-semibold tracking-tight text-ink md:text-xs">Notifications</p>
                  {hasNotifications && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-ink md:text-[10px]">{unread} new</span>}
                </div>
                <div className="border-t border-line/50" />
                {hasNotifications ? (
                  <ul className="max-h-[320px] overflow-y-auto scroll-thin p-1">
                    {MOCK_NOTIFICATIONS.map((n) => (
                      <li key={n.id} className="flex gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#f7f8f7]">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? "bg-line" : "bg-ink"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-ink md:text-xs">{n.title}</p>
                          <p className="mt-0.5 text-xs text-muted md:text-[11px]">{n.time}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center px-6 py-10 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4f6f4] text-muted md:h-9 md:w-9">
                      <Inbox size={18} />
                    </span>
                    <p className="mt-3 text-sm font-medium text-ink md:text-xs">No notifications</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted md:text-[11px]">You&apos;re all caught up. New updates will appear here.</p>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Plus — very right side */}
        <div ref={plusRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPlusOpen((v) => !v)}
            aria-label="Add content"
            aria-expanded={plusOpen}
            aria-haspopup="menu"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition md:h-[32px] md:w-[32px] ${plusOpen ? "bg-ink text-white" : "bg-ink text-white shadow-sm hover:bg-black"}`}
          >
            <Plus size={18} strokeWidth={2} className="md:h-[15px] md:w-[15px]" />
          </button>

          {plusOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 flex w-[192px] flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-float ring-1 ring-line/40" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPlusOpen(false);
                  setNoteOpen(true);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-ink transition hover:bg-shell"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white">
                  <NotebookPen size={14} strokeWidth={1.9} />
                </span>
                <span className="text-xs font-semibold">Add note</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPlusOpen(false);
                  setAccOpen(true);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-ink transition hover:bg-shell"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white">
                  <Award size={14} strokeWidth={1.9} />
                </span>
                <span className="text-xs font-semibold">Add accomplishment</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile burger */}
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="mobile-drawer"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink ring-1 ring-line/40 transition hover:bg-white/60 md:hidden"
        >
          <Menu size={18} strokeWidth={1.9} />
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-[#0f1410]/20 backdrop-blur-[1px]" />
          <div
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 right-0 flex w-[84vw] max-w-[320px] flex-col overflow-hidden rounded-l-[20px] bg-white shadow-float animate-rise"
          >
            <div className="flex items-center justify-between border-b border-line/40 px-4 py-4">
              <Logo />
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted ring-1 ring-line/40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto p-3">
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted/70">Pages</p>
              <nav className="space-y-1" aria-label="Mobile primary">
                {NAV.map(({ href, label }) => {
                  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setDrawerOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-ink text-white" : "text-ink hover:bg-[#f7f8f7]"}`}
                    >
                      {label}
                    </Link>
                  );
                })}
                <Link
                  href="/settings"
                  onClick={() => setDrawerOpen(false)}
                  aria-current={pathname.startsWith("/settings") ? "page" : undefined}
                  className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${pathname.startsWith("/settings") ? "bg-ink text-white" : "text-ink hover:bg-[#f7f8f7]"}`}
                >
                  Settings
                </Link>
              </nav>

              <div className="my-4 border-t border-line/40" />
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted/70">Add</p>
              <nav className="space-y-1" aria-label="Mobile add">
                <Link href="/notes" onClick={() => setDrawerOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-[#f7f8f7]">
                  Add note
                </Link>
                <Link href="/accomplishments" onClick={() => setDrawerOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-[#f7f8f7]">
                  Add accomplishment
                </Link>
              </nav>

              <div className="my-4 border-t border-line/40" />

              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted/70">Actions</p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setPaletteOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:bg-[#f7f8f7]"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f4f6f4] text-ink">
                    <Search size={16} strokeWidth={1.9} />
                  </span>
                  Search
                  <span className="ml-auto rounded bg-[#f4f6f4] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted">⌘K</span>
                </button>

                <div className="rounded-xl bg-[#fcfdfc] p-3 ring-1 ring-line/40">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-muted ring-1 ring-line/40">
                      <Bell size={14} />
                    </span>
                    <p className="text-sm font-medium text-ink">Notifications</p>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">You&apos;re all caught up. New updates appear here.</p>
                </div>

                <div className="rounded-xl bg-[#fcfdfc] p-3 ring-1 ring-line/40">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-muted ring-1 ring-line/40">
                      <UserRound size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-none text-ink">Folio</p>
                      <p className="text-xs text-muted">Workspace</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <Link href="/library" onClick={() => setDrawerOpen(false)} className="btn-secondary flex-1 justify-center h-8 text-xs">
                      <UserRound size={14} /> Profile
                    </Link>
                    <Link href="/settings" onClick={() => setDrawerOpen(false)} className="btn-secondary flex-1 justify-center h-8 text-xs">
                      <Settings size={14} /> Settings
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-line/40 p-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-muted ring-1 ring-line transition hover:text-ink"
              >
                <X size={16} /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NoteDialog open={noteOpen} onClose={() => setNoteOpen(false)} onSaved={() => router.push("/notes")} />
      <AccomplishmentDialog open={accOpen} onClose={() => setAccOpen(false)} onSaved={() => router.push("/accomplishments")} />
    </>
  );
}
