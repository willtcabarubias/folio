"use client";

import type { ReactNode } from "react";

export function Tooltip({ label, children, side = "bottom" }: { label: string; children: ReactNode; side?: "bottom" | "top" }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        aria-hidden
        className={`pointer-events-none absolute left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium tracking-tight text-white shadow-float ring-1 ring-white/10 opacity-0 transition duration-200 group-hover:opacity-100 group-hover:delay-300 group-focus-within:opacity-100 md:block ${side === "bottom" ? "top-full mt-2 translate-y-1 group-hover:translate-y-0" : "bottom-full mb-2 -translate-y-1 group-hover:translate-y-0"}`}
      >
        {label}
        <span
          aria-hidden
          className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-ink ${side === "bottom" ? "-top-1" : "-bottom-1"}`}
        />
      </span>
    </span>
  );
}
