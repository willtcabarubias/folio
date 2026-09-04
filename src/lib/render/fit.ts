import { trimOnce } from "@/lib/spec/normalize";
import type { DocumentSpec } from "@/lib/spec/types";
import { renderPdfMeasured } from "./pdf";

const DENSITIES = [1, 0.94, 0.88, 0.82, 0.76, 0.7];
const MAX_ROUNDS = 16;

/**
 * Guarantee a document lands on its page budget: first tighten the layout
 * (density), then progressively trim the least essential content.
 */
export async function fitToPages(spec: DocumentSpec): Promise<DocumentSpec> {
  const target = spec.targetPages;
  if (spec.format === "pptx" || !target) return spec;

  let current: DocumentSpec = { ...spec, density: 1 };
  let trimmed = 0;
  let lastPages = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let overshoot = 0;
    for (const d of DENSITIES) {
      const { pages } = await renderPdfMeasured({ ...current, density: d });
      lastPages = pages;
      if (pages <= target) return { ...current, density: d, fit: { targetPages: target, pages, trimmed, fitted: true } };
      overshoot = pages - target;
      if (overshoot > 1) break; // density alone will not close the gap
    }
    const steps = overshoot > 1 ? 4 : 1;
    let next: DocumentSpec | null = current;
    for (let i = 0; i < steps && next; i++) {
      const t = trimOnce(next);
      if (!t) break;
      next = t;
      trimmed++;
    }
    if (!next || next === current) break;
    current = next;
  }
  return { ...current, density: DENSITIES[DENSITIES.length - 1], fit: { targetPages: target, pages: lastPages, trimmed, fitted: false } };
}
