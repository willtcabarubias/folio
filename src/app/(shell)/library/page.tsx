import type { Metadata } from "next";
import { Suspense } from "react";
import { LibraryView } from "@/components/library/LibraryView";

export const metadata: Metadata = {
  title: "Library — Folio",
};

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-shell text-sm text-muted">Loading</div>}>
      <LibraryView />
    </Suspense>
  );
}
