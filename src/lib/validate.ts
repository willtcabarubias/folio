import { pdfSupportRatio } from "@/lib/render/pdf-text";
import { isFillerSection } from "@/lib/spec/normalize";
import type { DocumentSpec, Outline } from "@/lib/spec/types";

/**
 * Validate-style QA helpers (pptx/docx skill pattern, adapted to Folio's
 * deterministic engine): content QA, placeholder grep, slide-count match,
 * table bounds, WinAnsi preflight. Returns warnings — never throws.
 * Hybrid architecture: deterministic checks run before/after LLM, LLM never trusted alone.
 */

export type QaWarning = string;

const PLACEHOLDER_RE = /\b(x{3,}|lorem|ipsum|\[insert|\[tbd|TODO\b|this.*(page|slide).*layout|key point for .+ — part \d+)/i;
const TAKEAWAY_RE = /^(key takeaways?|key details.*takeaways?|putting it into practice|takeaways?)\s*:?$/i;

export function validateOutlineForExport(outline: Outline): QaWarning[] {
  const warnings: QaWarning[] = [];
  const content = outline.sections.filter((s) => s.layout !== "cover" && s.layout !== "agenda");
  if (!content.length && outline.targetLength >= 2) {
    warnings.push("Outline has no content sections — generation will pad contextually. Consider adding sections.");
  }
  let filler = 0;
  for (const s of outline.sections) {
    if (isFillerSection(s.title, s.points)) filler++;
    const hay = `${s.title} ${s.points.join(" ")}`;
    if (PLACEHOLDER_RE.test(hay)) warnings.push(`Placeholder text in "${s.title}" — fix before export.`);
  }
  if (filler > 0) warnings.push(`${filler} contextual filler section(s) added to hit length — review titles.`);
  if (outline.format === "pptx" && content.length !== outline.targetLength) {
    warnings.push(`Slide count ${content.length} differs from target ${outline.targetLength} — will pad/trim.`);
  }
  return warnings;
}

export function validateSpecForExport(spec: DocumentSpec, outline?: Outline): QaWarning[] {
  const warnings: QaWarning[] = [];
  if (!spec.blocks.length) warnings.push("Spec has no blocks.");
  const titles = new Set<string>();
  const outlineTitles = new Set((outline?.sections ?? []).map((s) => s.title.toLowerCase()));
  const outlineHasClosing = Boolean(outline?.sections.some((s) => s.layout === "closing"));
  let bulletRun = 0;
  for (const b of spec.blocks) {
    if (!b || typeof b.id !== "string") {
      warnings.push("Malformed block dropped from preview — regenerate if content missing.");
      continue;
    }
    // Takeaways without request: flag invented framing (content preserved as bullets by designPass).
    if (TAKEAWAY_RE.test(b.title || "") && !outlineTitles.has((b.title || "").toLowerCase()) && !outlineHasClosing) {
      warnings.push(`"${b.title}" wasn't requested — stripped to content-only. Remove it if unneeded.`);
    }
    // Layout diversity: flag 3+ bullet sections in a row (prefer table/timeline/columns).
    if (b.layout === "bullets" && b.id !== "cover") bulletRun++;
    else if (b.layout !== "cover" && b.layout !== "agenda") bulletRun = 0;
    if (bulletRun === 3) warnings.push("Three bullet sections in a row — consider table/timeline/columns for variety.");
    const key = (b.title || "").toLowerCase();
    if (key && titles.has(key) && b.layout !== "cover" && b.layout !== "closing") {
      warnings.push(`Duplicate section title "${b.title}" — consider varying angles.`);
    }
    titles.add(key);
    const hay = `${b.title} ${(b.body ?? "")} ${(b.bullets ?? []).join(" ")}`;
    if (PLACEHOLDER_RE.test(hay)) warnings.push(`Placeholder in "${b.title}" — edit before export.`);
    if (b.layout === "table" && b.table) {
      const cols = Math.max(b.table.headers.length, ...b.table.rows.map((r) => r.length), 1);
      if (cols > 6) warnings.push(`Table in "${b.title}" has ${cols} columns (max 6 will clip) — split it.`);
      if (b.table.rows.length > 20) warnings.push(`Table in "${b.title}" has ${b.table.rows.length} rows — consider splitting.`);
    }
    if (b.layout === "bullets" && (b.bullets ?? []).length > 8) {
      warnings.push(`"${b.title}" has ${(b.bullets ?? []).length} bullets — will split across slides/pages.`);
    }
  }
  // WinAnsi preflight (Latin-only PDF): warn early, don't 422-surprise.
  try {
    const ratio = pdfSupportRatio(spec);
    if (ratio < 0.85) {
      warnings.push("Non-Latin script detected — PDF export may drop characters. DOCX is safest.");
    } else if (ratio < 0.98) {
      warnings.push("Some special characters may not render in PDF — check preview.");
    }
  } catch {
    // Never block export on QA failure.
  }
  if (!spec.fit?.fitted && spec.targetPages && spec.format !== "pptx") {
    warnings.push(
      `Page budget missed (${spec.fit?.pages ?? "?"} vs target ${spec.targetPages}) — trimmed ${spec.fit?.trimmed ?? 0} section(s). Shorten or add pages.`,
    );
  }
  return warnings;
}
