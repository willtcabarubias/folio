import type { Metadata } from "next";
import { Builder } from "@/components/studio/Builder";

export const metadata: Metadata = {
  title: "Studio — Folio",
};

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Builder id={id} />;
}
