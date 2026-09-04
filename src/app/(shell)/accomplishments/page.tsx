import type { Metadata } from "next";
import { Suspense } from "react";
import { AccomplishmentsView } from "@/components/accomplishments/AccomplishmentsView";

export const metadata: Metadata = { title: "Accomplishments — Folio" };

export default function AccomplishmentsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-shell text-sm text-muted">Loading</div>}>
      <AccomplishmentsView />
    </Suspense>
  );
}
