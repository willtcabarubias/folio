import type { Metadata } from "next";
import { Suspense } from "react";
import { NotesView } from "@/components/notes/NotesView";

export const metadata: Metadata = { title: "Notes — Folio" };

export default function NotesPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-shell text-sm text-muted">Loading</div>}>
      <NotesView />
    </Suspense>
  );
}
