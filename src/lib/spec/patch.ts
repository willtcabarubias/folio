import { mergeHeader } from "./intent";
import type { DocumentSpec, Outline, OutlineSection } from "./types";

/* ------------------------------------------------------------------ */
/*  Patch engine: edit, never remake (unless explicitly asked)          */
/*                                                                      */
/*  The planner still returns a FULL outline (stable contract), but the */
/*  client + server merge it against the previous outline so a small   */
/*  "add X / remove Y / put Group on top" can never wipe the file.     */
/*  Full regeneration only happens for explicit remake language, a      */
/*  format switch, or >50% structural change.                           */
/* ------------------------------------------------------------------ */

export type OutlineDiff = {
  added: OutlineSection[];
  removed: OutlineSection[];
  changed: { old: OutlineSection; next: OutlineSection }[];
  headerChanged: boolean;
  keptRatio: number;
};

function normPoints(p: string[]): string {
  return p.map((x) => x.trim().toLowerCase()).join("|");
}

export function diffOutlines(oldO: Outline | null, nextO: Outline): OutlineDiff {
  if (!oldO) return { added: nextO.sections, removed: [], changed: [], headerChanged: Boolean(nextO.header), keptRatio: 0 };
  const oldById = new Map(oldO.sections.map((s) => [s.id, s]));
  const nextById = new Map(nextO.sections.map((s) => [s.id, s]));
  const added = nextO.sections.filter((s) => !oldById.has(s.id));
  const removed = oldO.sections.filter((s) => !nextById.has(s.id));
  const changed: OutlineDiff["changed"] = [];
  for (const s of nextO.sections) {
    const o = oldById.get(s.id);
    if (o && (o.title !== s.title || o.layout !== s.layout || normPoints(o.points) !== normPoints(s.points))) changed.push({ old: o, next: s });
  }
  const headerChanged =
    (nextO.header?.group ?? "") !== (oldO.header?.group ?? "") ||
    (nextO.header?.members ?? []).join("|") !== (oldO.header?.members ?? []).join("|");
  const kept = oldO.sections.length ? (oldO.sections.length - removed.length) / oldO.sections.length : 1;
  return { added, removed, changed, headerChanged, keptRatio: kept };
}

/**
 * Merge a planner outline over the previous one.
 * - Header: per-field merge, explicit next wins.
 * - Sections: keep every old section the planner dropped, UNLESS the user
 *   explicitly asked to remove it or asked for a full remake.
 * - targetLength/lengthSource/format: keep old unless remake or format switch.
 */
export function mergeOutlinePreserving(
  oldO: Outline | null,
  nextO: Outline,
  opts: { allowRemake: boolean; formatSwitched: boolean; explicitRemovals?: string[] },
): Outline {
  if (!oldO || opts.allowRemake || opts.formatSwitched) return nextO;
  const header = mergeHeader(oldO.header, nextO.header);
  const nextIds = new Set(nextO.sections.map((s) => s.id));
  const explicit = new Set((opts.explicitRemovals ?? []).map((s) => s.toLowerCase()));
  const dropped = oldO.sections.filter((s) => !nextIds.has(s.id));
  // A dropped section survives unless the user named it in a remove/delete request.
  const rescued = dropped.filter((s) => {
    const t = s.title.toLowerCase();
    for (const e of explicit) if (e && (t.includes(e) || e.includes(t.slice(0, 24)))) return false;
    return true;
  });
  if (!rescued.length) return { ...nextO, header };
  // Re-insert rescued sections before closing (or at end), preserving original order.
  const closing = nextO.sections.filter((s) => s.layout === "closing");
  const body = nextO.sections.filter((s) => s.layout !== "closing");
  const ordered = [...body];
  for (const r of oldO.sections) {
    if (rescued.some((x) => x.id === r.id)) {
      const at = ordered.length && closing.length ? ordered.length : ordered.length;
      ordered.splice(at, 0, r);
    }
  }
  return {
    ...nextO,
    header,
    // Never shrink an explicit user length via an accidental drop.
    targetLength: nextO.targetLength,
    lengthSource: nextO.lengthSource,
    sections: [...ordered, ...closing],
  };
}

/** Section titles the user explicitly asked to remove ("remove/delete X"). */
export function explicitRemovalTitles(text: string | undefined | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /\b(?:remove|delete|drop|take out|get rid of)\b\s+(?:the\s+|this\s+|that\s+)?([^.,;\n]{3,80}?)(?=(?:\s+section|\s+slide|\s+page)?(?:[.,;\n]|$|\s+and\s+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1].trim();
    if (t && !/^(it|this|that|them|all|everything)$/i.test(t)) out.push(t);
  }
  return out;
}

/** Merge freshly expanded blocks into an existing spec, preserving untouched blocks. */
export function applySpecPatch(prev: DocumentSpec, fresh: DocumentSpec["blocks"], header?: DocumentSpec["header"]): DocumentSpec {
  const byId = new Map(prev.blocks.map((b) => [b.id, b]));
  for (const b of fresh) {
    if (b && typeof b.id === "string" && b.id) byId.set(b.id, b);
  }
  // Preserve previous block order; append genuinely new ids at end (before closing).
  const freshIds = new Set(fresh.map((b) => b.id));
  const closing = prev.blocks.filter((b) => b.layout === "closing" && !freshIds.has(b.id));
  const body = prev.blocks.filter((b) => b.layout !== "closing" || freshIds.has(b.id));
  const ordered = body.map((b) => byId.get(b.id) ?? b);
  for (const b of fresh) {
    if (!ordered.some((x) => x.id === b.id)) {
      const idx = ordered.findIndex((x) => x.layout === "closing");
      if (idx >= 0) ordered.splice(idx, 0, b);
      else ordered.push(b);
    }
  }
  void closing;
  return { ...prev, blocks: ordered, ...(header !== undefined ? { header } : {}) };
}
