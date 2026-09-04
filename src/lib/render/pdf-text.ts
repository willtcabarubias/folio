import type { DocumentSpec } from "@/lib/spec/types";

/* ------------------------------------------------------------------ */
/*  WinAnsi safety (standard PDF fonts only cover Latin scripts)        */
/* ------------------------------------------------------------------ */

const SYMBOL_MAP: Record<string, string> = {
  "\u2192": "->",
  "\u2190": "<-",
  "\u2194": "<->",
  "\u21D2": "=>",
  "\u2265": ">=",
  "\u2264": "<=",
  "\u2260": "!=",
  "\u2212": "-",
  "\u2248": "~",
  "\u2713": "v",
  "\u2714": "v",
  "\u2717": "x",
  "\u2718": "x",
  "\u2610": "[ ]",
  "\u2611": "[x]",
  "\u00A0": " ",
  "\u2009": " ",
  "\u200B": "",
  "\u2011": "-",
  "\u2012": "-",
  "\u2015": "-",
  "\u2032": "'",
  "\u2033": '"',
  "\u25AA": "\u2022",
  "\u25CF": "\u2022",
  "\u25E6": "\u2022",
  "\u2023": "\u2022",
  "\u2043": "-",
  "\u2070": "0",
  "\u00B2": "2",
  "\u00B3": "3",
  "\u2081": "1",
  "\u2082": "2",
};
const WINANSI_EXTRA = new Set(
  "\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178".split(""),
);

function isEncodable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code < 0x100 || WINANSI_EXTRA.has(ch);
}

export function pdfText(input: string | undefined | null): string {
  if (!input) return "";
  let out = "";
  for (const ch of input.normalize("NFC")) {
    if (SYMBOL_MAP[ch] !== undefined) out += SYMBOL_MAP[ch];
    else if (isEncodable(ch)) out += ch;
    else {
      const decomposed = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      out += decomposed && isEncodable(decomposed) ? decomposed : "";
    }
  }
  return out.replace(/[ \t]{2,}/g, " ");
}

/** Share of letters that survive WinAnsi encoding; used to refuse non-Latin PDFs gracefully. */
export function pdfSupportRatio(spec: DocumentSpec): number {
  const chunks: string[] = [spec.title, spec.subtitle ?? ""];
  for (const b of spec.blocks) {
    chunks.push(b.title, b.subtitle ?? "", b.body ?? "", ...b.bullets, b.callout ?? "");
    for (const c of b.columns ?? []) chunks.push(c.heading ?? "", ...c.bullets, c.body ?? "");
    for (const s of b.steps ?? []) chunks.push(s.label, s.description ?? "");
    for (const g of b.groups ?? []) chunks.push(g.heading, g.meta ?? "", ...g.bullets, g.body ?? "");
  }
  const letters = chunks.join(" ").replace(/[^\p{L}]/gu, "");
  if (!letters.length) return 1;
  let ok = 0;
  for (const ch of letters) if (isEncodable(ch) || isEncodable(ch.normalize("NFD")[0] ?? "")) ok++;
  return ok / letters.length;
}
