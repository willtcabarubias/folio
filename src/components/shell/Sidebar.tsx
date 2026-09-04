"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Award, FolderOpen, House, LogOut, NotebookPen, Settings, UserRound } from "lucide-react";

const NAV_TOP = [
  { href: "/", label: "Home", icon: House },
  { href: "/library", label: "Library", icon: FolderOpen },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/accomplishments", label: "Accomplishments", icon: Award },
] as const;

function LogoLarge() {
  return (
    <Link href="/" aria-label="Folio home" className="flex h-11 w-11 items-center justify-center rounded-2xl md:h-10 md:w-10">
      <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden className="h-[34px] w-[34px] md:h-[32px] md:w-[32px]">
        <path d="M6 5h20v6H12v4h11v6H12v6H6V5z" fill="#0F1410" />
        <circle cx="25" cy="24" r="3.5" fill="#111311" />
      </svg>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  return (
    <aside
      aria-label="Primary navigation"
      className="hidden h-screen shrink-0 flex-col items-center bg-transparent px-3 md:flex md:w-[72px] lg:w-[80px]"
    >
      {/* Logo — same row height as top bar (h-14 md:h-12) to align with bell icon */}
      <div className="flex h-14 w-full shrink-0 items-center justify-center md:h-12">
        <LogoLarge />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-4">
        <nav className="flex flex-col items-center gap-2" aria-label="Primary">
          {NAV_TOP.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 w-11 items-center justify-center rounded-2xl text-muted transition md:h-10 md:w-10 ${
                  active ? "bg-white text-ink shadow-sm ring-1 ring-line/40" : "hover:bg-white/60 hover:text-ink"
                }`}
              >
                <Icon size={20} strokeWidth={1.9} className="md:h-[18px] md:w-[18px]" />
              </Link>
            );
          })}
        </nav>
      </div>

      <div ref={profileRef} className="relative flex flex-col items-center gap-3 pb-4">
        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          aria-label="User profile"
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          className={`flex h-11 w-11 items-center justify-center rounded-full transition md:h-10 md:w-10 ${profileOpen ? "bg-ink text-white" : "bg-white text-muted ring-1 ring-line/40 hover:text-ink"}`}
        >
          <UserRound size={20} strokeWidth={1.9} className="md:h-[18px] md:w-[18px]" />
        </button>

        {profileOpen && (
          <div className="absolute bottom-0 left-full z-20 ml-3 flex w-56 flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-float ring-1 ring-line/40" role="menu">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-muted ring-1 ring-line/40">
                <UserRound size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none text-ink">Folio</p>
                <p className="mt-0.5 truncate text-xs text-muted">Workspace</p>
              </div>
            </div>
            <div className="my-1 border-t border-line/60" />
            <Link href="/library" onClick={() => setProfileOpen(false)} role="menuitem" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink transition hover:bg-shell">
              <UserRound size={16} className="text-muted" />
              Profile
            </Link>
            <Link href="/settings" onClick={() => setProfileOpen(false)} role="menuitem" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink transition hover:bg-shell">
              <Settings size={16} className="text-muted" />
              Settings
            </Link>
            <button type="button" role="menuitem" onClick={() => setProfileOpen(false)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink transition hover:bg-shell">
              <LogOut size={16} className="text-muted" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
