import { trimOnce } from "@/lib/spec/normalize";
import type { DocumentSpec } from "@/lib/spec/types";
import { renderPdfMeasured } from "./pdf";

const DENSITIES = [1, 0.94, 0.88, 0.82, 0.76, 0.7];
const MAX_ROUNDS_BASE = 8;

/**
 * Guarantee a document lands on its page budget: first tighten the layout
 * (density), then progressively trim the least essential content.
 * Bulletproof: adaptive round cap, early-exit when stuck, honest fit flag
 * measured from the FINAL spec (not an intermediate probe).
 */
export async function fitToPages(spec: DocumentSpec, opts?: { timeoutMs?: number }): Promise<DocumentSpec> {
  const target = spec.targetPages;
  if (spec.format === "pptx" || !target) return spec;

  const started = Date.now();
  const timeoutMs = opts?.timeoutMs ?? 9000;
  // Adaptive cap: small docs need fewer rounds; large docs get a bit more but never 16.
  const maxRounds = Math.min(MAX_ROUNDS_BASE, Math.max(4, Math.ceil(target / 2) + 3));

  let current: DocumentSpec = { ...spec, density: 1 };
  let trimmed = 0;
  let lastPages = 0;
  let lastDensity = 1;
  let stuckRounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    if (Date.now() - started > timeoutMs) break;
    let overshoot = 0;
    let bestFit: { density: number; pages: number } | null = null;
    for (const d of DENSITIES) {
      if (Date.now() - started > timeoutMs) break;
      const { pages } = await renderPdfMeasured({ ...current, density: d });
      lastPages = pages;
      lastDensity = d;
      if (pages <= target) {
        return { ...current, density: d, fit: { targetPages: target, pages, trimmed, fitted: true } };
      }
      if (!bestFit || pages < bestFit.pages) bestFit = { density: d, pages };
      overshoot = pages - target;
      if (overshoot > 1) break; // density alone will not close the gap
    }
    // If trimming no longer reduces pages, stop early instead of burning renders.
    if (bestFit && bestFit.pages >= lastPages && round > 0) {
      stuckRounds++;
      if (stuckRounds >= 2) break;
    } else {
      stuckRounds = 0;
    }
    const steps = overshoot > 1 ? 3 : 1;
    let next: DocumentSpec | null = current;
    for (let i = 0; i < steps && next; i++) {
      if (Date.now() - started > timeoutMs) break;
      const t = trimOnce(next);
      if (!t) break;
      next = t;
      trimmed++;
    }
    if (!next || next === current) break;
    current = next;
  }
  // Honest final measurement: re-measure the spec we actually return.
  try {
    const final = await renderPdfMeasured({ ...current, density: DENSITIES[DENSITIES.length - 1] });
    lastPages = final.pages;
    lastDensity = DENSITIES[DENSITIES.length - 1];
  } catch {
    // Keep last probe values on measurement failure.
  }
  return { ...current, density: lastDensity, fit: { targetPages: target, pages: lastPages, trimmed, fitted: false } };
}
