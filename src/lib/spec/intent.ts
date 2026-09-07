import type { CoverHeader } from "./types";

/* ------------------------------------------------------------------ */
/*  Deterministic intent helpers (never trust the LLM to remember)      */
/*                                                                      */
/*  Raw chat text is truncated in several places (expand brief 2500    */
/*  chars, last 10 turns, compactResponse drops purpose). These        */
/*  helpers re-derive the sticky bits — cover header, remake intent,   */
/*  domain/formality — from the full transcript on every call so a     */
/*  custom request can never be silently lost.                          */
/* ------------------------------------------------------------------ */

export type IntentProfile = {
  domain: "school" | "business" | "personal" | "other";
  formality: "formal" | "neutral" | "casual";
};

export function detectIntent(text: string): IntentProfile {
  const t = (text || "").toLowerCase();
  const domain: IntentProfile["domain"] = /\b(class|classroom|school|teacher|student|homework|assignment|lesson|quiz|exam|grade|course|subject|module)\b/.test(t)
    ? "school"
    : /\b(business|company|client|revenue|market|sales|pitch|invoice|proposal|startup|quarter|kpi)\b/.test(t)
      ? "business"
      : /\b(birthday|wedding|family|personal|diary|travel|hobby|resume|cv)\b/.test(t)
        ? "personal"
        : "other";
  const formality: IntentProfile["formality"] = /\b(formal|official|academic|professional|respectfully|sincerely)\b/.test(t)
    ? "formal"
    : /\b(casual|fun|friendly|chill|playful)\b/.test(t)
      ? "casual"
      : "neutral";
  return { domain, formality };
}

/** Explicit full-remake language only. Anything else must patch, never rebuild. */
export function isRemakeRequest(text: string | undefined | null): boolean {
  if (!text) return false;
  return /\b(remake|rebuild|redesign)\b.*\b(from scratch|all over|everything)\b|\bstart over\b|\bregenerate\s+(all|everything|the whole|entire)\b|\bthrow (it|this) away.*(start|redo)\b/i.test(text);
}

/** Header-only edit: mentions Group/members/subject/section/top-side header without other content verbs. */
export function isHeaderOnlyRequest(text: string | undefined | null): boolean {
  if (!text || isRemakeRequest(text)) return false;
  const mentionsHeader =
    /\bgroup\s*\d*\b|\bmembers?\b|\bsubject\b|\basignatura\b|\bsection\s*[:\-–—]|\bsection\s+[a-z0-9]+[-–—][a-z0-9]+|\bseksyon\b|\bput\b.*\btop\b|\bheader\b|\bcover\b.*\bname/i.test(text);
  if (!mentionsHeader) return false;
  // Strip header-related tokens first so "add Group 1 on top" isn't misread as a
  // content edit — then look for real content work in what remains. Note "section"
  // is stripped only in labeled/code form ("Section: 7-Ruby"); a bare "add a section
  // about X" stays a content edit.
  const stripped = text
    .toLowerCase()
    .replace(/\bgroup\s*\d+[a-z]?\b/g, " ")
    .replace(/\bmembers?\b|\bsubjects?\b|\basignatura\b|\bseksyon\b|\bnames?\b|\bheaders?\b|\bcovers?\b/g, " ")
    .replace(/\bsections?\s*[:\-–—]\s*\S+/g, " ")
    .replace(/\bsection\s+[a-z0-9]+[-–—][a-z0-9]+\b/g, " ")
    .replace(/\b(on|at)\s+(the\s+)?top\b/g, " ")
    .replace(/\bput\b|\badd\b/g, " ");
  if (/\b(write|explain|expand|longer|shorter|delete|remove|drop|create|generate|revise|rewrite|update|change|convert)\b/.test(stripped)) return false;
  if (/\b(sections?|slides?|pages?|tables?|chapters?|bullets?|paragraphs?|quizzes|questions?)\b/.test(stripped)) return false;
  if (/\b\d+\s*(more\s+)?(pages?|slides?)\b|\bmore\s+(pages?|slides?)\b/.test(stripped)) return false;
  return true;
}

function cleanNameLine(s: string): string {
  return s
    .replace(/^[ \t]*(?:[-*•▪◦–—]|\d{1,2}[.)])\s+/g, "")
    .replace(/^(members?|names?)\s*[:\-–—]\s*/i, "")
    .trim()
    .slice(0, 80);
}

function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 80) return false;
  if (/^(group\s*\d*|classroom activity|recommend a computer|one-pager.*|september|page \d+)$/i.test(t)) return false;
  // "Lastname, Firstname" or "Firstname Lastname" — at least 2 alpha tokens, allow commas/periods.
  const words = t.replace(/[,.;]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (!/^[a-zA-Z ,.'-]+$/.test(t)) return false;
  return words.every((w) => /[a-zA-Z]/.test(w));
}

/**
 * Deterministic Group + members extraction from free text.
 * Handles:
 *  "Group 1\nBayang, Jhazel\nCatani, Claire\n..."
 *  "Group 1: Bayang, Catani, Teriote, Cabarubias"
 *  "members: Alice, Bob"
 */
export function extractCoverHeader(text: string | undefined | null): CoverHeader | undefined {
  if (!text) return undefined;
  const lines = String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let group: string | undefined;
  let subject: string | undefined;
  let section: string | undefined;
  const members: string[] = [];

  for (const line of lines) {
    const subj = line.match(/^\s*(subject|asignatura|course)\s*[:\-–—]\s*(.+)$/i);
    if (subj && !subject) {
      subject = subj[2].trim().slice(0, 60) || undefined;
      continue;
    }
    const sect = line.match(/^\s*(section|seksyon|grade\s*&?\s*section)\s*[:\-–—]\s*(.+)$/i);
    if (sect && !section) {
      section = sect[2].trim().slice(0, 60) || undefined;
      continue;
    }
    const gm = line.match(/^\s*(group\s*\d+[a-z]?)\s*[:\-–—]?\s*(.*)$/i);
    if (gm && !group) {
      const label = gm[1].trim().replace(/\s+/g, " ");
      group = label.charAt(0).toUpperCase() + label.slice(1);
      const rest = (gm[2] || "").trim();
      if (rest) {
        // "Group 1: Alice, Bob" — split remainder on commas/semicolons into candidate names.
        const parts = rest.split(/[;]+/).flatMap((p) => p.split(/\s{2,}/));
        for (const p of parts) {
          const c = cleanNameLine(p);
          if (c && looksLikeName(c)) members.push(c);
          else if (c && /,/.test(c) && c.split(",").length >= 2) {
            // comma-joined names without newlines: "Bayang, Jhazel, Catani, Claire" → pair them.
            const toks = c.split(",").map((x) => x.trim()).filter(Boolean);
            for (let i = 0; i + 1 < toks.length; i += 2) {
              const paired = `${toks[i]}, ${toks[i + 1]}`;
              if (looksLikeName(paired)) members.push(paired);
            }
          }
        }
      }
      continue;
    }
    const mm = line.match(/^\s*(members?|names?)\s*[:\-–—]\s*(.+)$/i);
    if (mm) {
      const rest = mm[2];
      for (const part of rest.split(/[;,]+|\s{2,}/)) {
        const c = cleanNameLine(part);
        if (c && looksLikeName(c)) members.push(c);
      }
      continue;
    }
    const c = cleanNameLine(line);
    if (c && looksLikeName(c)) members.push(c);
  }

  // Fallback: single-line "put Group 1 Bayang, Jhazel Catani, Claire … on top / on the top side".
  // Names arrive as "Last, First" pairs separated by spaces (not commas), so pair-wise
  // comma splitting mis-groups them — match each "Last, First [Second]" directly.
  if (!members.length) {
    const gm = String(text).match(/group\s*(\d+[a-z]?)\b/i);
    if (gm) {
      if (!group) group = `Group ${gm[1].trim()}`;
      const after = String(text).slice((gm.index ?? 0) + gm[0].length);
      // Case-sensitive on purpose: avoids turning "group 3 is about dogs, cats" into members.
      const pairRe = /\b([A-Z][a-zA-Z.'-]*,\s*[A-Z][a-zA-Z.'-]*(?:\s+[A-Z][a-zA-Z.'-]+)?)\b/g;
      const found: { name: string; index: number }[] = [];
      let pm: RegExpExecArray | null;
      while ((pm = pairRe.exec(after)) !== null) {
        const c = cleanNameLine(pm[1]);
        if (c && looksLikeName(c) && !found.some((f) => f.name === c)) found.push({ name: c, index: pm.index });
        if (found.length >= 8 || pm[0].length === 0) break;
      }
      // Guard against prose false positives ("group 3 is about dogs, Cats"): accept a lone
      // pair only when it sits right after the label; otherwise require 2+ pairs.
      if (found.length >= 2 || (found.length === 1 && found[0].index <= 40)) {
        for (const f of found) members.push(f.name);
      }
    }
  }

  const uniq = [...new Set(members)].slice(0, 8);
  if (!group && !uniq.length && !subject && !section) return undefined;
  return {
    ...(group ? { group: group.slice(0, 60) } : {}),
    ...(uniq.length ? { members: uniq } : {}),
    ...(subject ? { subject } : {}),
    ...(section ? { section } : {}),
  };
}

/** Merge two headers: explicit next wins per-field, otherwise keep old. */
export function mergeHeader(oldH: CoverHeader | undefined, nextH: CoverHeader | undefined): CoverHeader | undefined {
  if (!oldH && !nextH) return undefined;
  const pick = (n?: string, o?: string) => (n?.trim() ? n.trim().slice(0, 60) : o);
  const group = pick(nextH?.group, oldH?.group);
  const members = nextH?.members?.length ? nextH.members : oldH?.members;
  const subject = pick(nextH?.subject, oldH?.subject);
  const section = pick(nextH?.section, oldH?.section);
  if (!group && !members?.length && !subject && !section) return undefined;
  return { ...(group ? { group } : {}), ...(members?.length ? { members } : {}), ...(subject ? { subject } : {}), ...(section ? { section } : {}) };
}

/** One-line sticky summary injected into every LLM context so truncation can't drop it. */
export function headerToPromptText(h: CoverHeader | undefined): string {
  if (!h || (!h.group && !h.members?.length && !h.subject && !h.section)) return "";
  const parts = ["Cover header (render on COVER ONLY, never in body bullets):"];
  if (h.group) parts.push(`- Group: ${h.group}`);
  if (h.members?.length) parts.push(`- Members: ${h.members.join(" · ")}`);
  if (h.subject) parts.push(`- Subject: ${h.subject}`);
  if (h.section) parts.push(`- Section: ${h.section}`);
  return parts.join("\n");
}
