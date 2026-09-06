import type { ThemeId } from "./types";

export type Ornament = "none" | "lines-diagonal" | "wave" | "dots" | "grid" | "pill";
export type BulletStyle = "dot" | "hollow" | "dash" | "square" | "squircle";

export type Theme = {
  id: ThemeId;
  name: string;
  description: string;
  bestFor: string;
  /** Hex colors WITHOUT the leading "#" (office formats want it that way). */
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    bg: string;
    surface: string;
    text: string;
    muted: string;
    onPrimary: string;
    line: string;
  };
  fonts: { heading: string; body: string };
  /** Optional display/cursive for covers when mood allows (falls back to heading if not embedded). */
  displayFont?: string;
  pdfFonts: { heading: string; body: string; italic: string; bold: string; display?: string };
  /** Dark slide backgrounds throughout (documents always stay light unless mood=dark). */
  dark: boolean;
  /** Ornament + bullet system extracted from reference patterns. */
  ornament: Ornament;
  bulletStyle: BulletStyle;
  /** Swatch used in the UI. */
  swatch: [string, string];
};

const SANS = { heading: "Calibri", body: "Calibri" };
const SERIF_HEAD = { heading: "Georgia", body: "Calibri" };
const HELV = { heading: "Helvetica-Bold", body: "Helvetica", italic: "Helvetica-Oblique", bold: "Helvetica-Bold" };
const TIMES_HEAD = { heading: "Times-Bold", body: "Helvetica", italic: "Helvetica-Oblique", bold: "Helvetica-Bold" };

export const THEMES: Record<ThemeId, Theme> = {
  mono: {
    id: "mono",
    name: "Mono",
    description: "Monochrome, modern and professional",
    bestFor: "everything",
    colors: {
      primary: "111827",
      secondary: "4B5563",
      accent: "E5E7EB",
      bg: "FFFFFF",
      surface: "F3F4F6",
      text: "111827",
      muted: "6B7280",
      onPrimary: "FFFFFF",
      line: "E5E7EB",
    },
    fonts: SANS,
    pdfFonts: HELV,
    dark: false,
    ornament: "none",
    bulletStyle: "dot",
    swatch: ["#111827", "#9CA3AF"],
  },
  azure: {
    id: "azure",
    name: "Azure",
    description: "Clean blue gradient, airy and modern",
    bestFor: "business, product, general purpose",
    colors: {
      primary: "2F5BEA",
      secondary: "7AA2FF",
      accent: "C7D7FF",
      bg: "F6F8FD",
      surface: "FFFFFF",
      text: "141B2D",
      muted: "6B7590",
      onPrimary: "FFFFFF",
      line: "DDE4F3",
    },
    fonts: SANS,
    pdfFonts: HELV,
    dark: false,
    ornament: "none",
    bulletStyle: "dot",
    swatch: ["#2F5BEA", "#7AA2FF"],
  },
  executive: {
    id: "executive",
    name: "Executive",
    description: "Navy and gold, formal and authoritative",
    bestFor: "board decks, finance, consulting, formal reports",
    colors: {
      primary: "0F2A4A",
      secondary: "1F4E79",
      accent: "D4A853",
      bg: "FFFFFF",
      surface: "F8F9FA",
      text: "16202E",
      muted: "6E7684",
      onPrimary: "FFFFFF",
      line: "E3E0D8",
    },
    fonts: SERIF_HEAD,
    pdfFonts: TIMES_HEAD,
    dark: false,
    ornament: "none",
    bulletStyle: "dot",
    swatch: ["#0F2A4A", "#D4A853"],
  },
  academic: {
    id: "academic",
    name: "Academic",
    description: "Ink, cream and rust, scholarly and calm",
    bestFor: "school, lectures, essays, research papers",
    colors: {
      primary: "2B2D42",
      secondary: "5C6378",
      accent: "C8553D",
      bg: "FFF9F0",
      surface: "FFFCF5",
      text: "22242F",
      muted: "737A8C",
      onPrimary: "FFFFFF",
      line: "E8E0D2",
    },
    fonts: SERIF_HEAD,
    pdfFonts: TIMES_HEAD,
    dark: false,
    ornament: "lines-diagonal",
    bulletStyle: "dot",
    swatch: ["#2B2D42", "#C8553D"],
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    description: "Dark canvas with electric blue and violet",
    bestFor: "technology, startups, engineering, AI",
    colors: {
      primary: "0B1020",
      secondary: "8B5CF6",
      accent: "5B8CFF",
      bg: "0B1020",
      surface: "161C33",
      text: "E8ECF8",
      muted: "9AA5C4",
      onPrimary: "FFFFFF",
      line: "27304F",
    },
    fonts: SANS,
    pdfFonts: HELV,
    dark: true,
    ornament: "none",
    bulletStyle: "dot",
    swatch: ["#0B1020", "#5B8CFF"],
  },
  coral: {
    id: "coral",
    name: "Coral",
    description: "Warm coral and amber, energetic and friendly",
    bestFor: "marketing, creative, events, education for kids",
    colors: {
      primary: "E4572E",
      secondary: "F3A712",
      accent: "FFD9C9",
      bg: "FFF8F3",
      surface: "FFFFFF",
      text: "2B1D16",
      muted: "8A7168",
      onPrimary: "FFFFFF",
      line: "F3E1D6",
    },
    fonts: SANS,
    pdfFonts: HELV,
    dark: false,
    ornament: "dots",
    bulletStyle: "dot",
    swatch: ["#E4572E", "#F3A712"],
  },
  forest: {
    id: "forest",
    name: "Forest",
    description: "Deep green and mint, natural and trustworthy",
    bestFor: "sustainability, health, science, NGOs",
    colors: {
      primary: "2D6A4F",
      secondary: "52B788",
      accent: "B7E4C7",
      bg: "F4FAF6",
      surface: "FFFFFF",
      text: "1B2B22",
      muted: "6A7C72",
      onPrimary: "FFFFFF",
      line: "DCEBE2",
    },
    fonts: SANS,
    pdfFonts: HELV,
    dark: false,
    ornament: "pill",
    bulletStyle: "dot",
    swatch: ["#2D6A4F", "#52B788"],
  },
  slate: {
    id: "slate",
    name: "Slate",
    description: "Monochrome minimal with a single blue accent",
    bestFor: "internal docs, engineering, memos, resumes",
    colors: {
      primary: "1F2937",
      secondary: "4B5563",
      accent: "3B82F6",
      bg: "FFFFFF",
      surface: "F8FAFC",
      text: "111827",
      muted: "6B7280",
      onPrimary: "FFFFFF",
      line: "E5E7EB",
    },
    fonts: { heading: "Arial", body: "Arial" },
    pdfFonts: HELV,
    dark: false,
    ornament: "none",
    bulletStyle: "hollow",
    swatch: ["#1F2937", "#3B82F6"],
  },
  plum: {
    id: "plum",
    name: "Plum",
    description: "Violet and lavender, polished and contemporary",
    bestFor: "design, workshops, HR, community, lifestyle",
    colors: {
      primary: "5B21B6",
      secondary: "8B5CF6",
      accent: "DDD6FE",
      bg: "FAF7FF",
      surface: "FFFFFF",
      text: "1E1B2E",
      muted: "716A8A",
      onPrimary: "FFFFFF",
      line: "E9E3F7",
    },
    fonts: SANS,
    pdfFonts: HELV,
    dark: false,
    ornament: "grid",
    bulletStyle: "dot",
    swatch: ["#5B21B6", "#8B5CF6"],
  },
  warm: {
    id: "warm",
    name: "Warm Paper",
    description: "Cream paper #FFF9F0 with ink and warm lines — editorial, calm, printable",
    bestFor: "essays, study guides, comparative essays, reading handouts, humanities",
    colors: {
      primary: "1F2937",
      secondary: "4B5563",
      accent: "F3EFE6",
      bg: "FFF9F0",
      surface: "FFFCF5",
      text: "1C1E26",
      muted: "6B7280",
      onPrimary: "FFFFFF",
      line: "E8E0D2",
    },
    fonts: SERIF_HEAD,
    displayFont: "Caveat",
    pdfFonts: { ...TIMES_HEAD, display: "Helvetica-Oblique" },
    dark: false,
    ornament: "lines-diagonal",
    bulletStyle: "squircle",
    swatch: ["#FFF9F0", "#E8E0D2"],
  },
  noir: {
    id: "noir",
    name: "Noir",
    description: "Soft black editorial — premium, formal, high contrast",
    bestFor: "formal reports, manuals, executive summaries, certificates",
    colors: {
      primary: "E8ECF8",
      secondary: "A1AEC6",
      accent: "2A2E3A",
      bg: "0A0A0B",
      surface: "16161A",
      text: "F8FAFC",
      muted: "9AA3B5",
      onPrimary: "0A0A0B",
      line: "2E333E",
    },
    fonts: SANS,
    pdfFonts: HELV,
    dark: true,
    ornament: "none",
    bulletStyle: "dash",
    swatch: ["#0A0A0B", "#2E333E"],
  },
  cool: {
    id: "cool",
    name: "Cool Blue",
    description: "Cool blue paper — calm, tech, modern classroom",
    bestFor: "science, tech, cool-tone planners, blue-themed docs",
    colors: {
      primary: "102A6B",
      secondary: "3B82F6",
      accent: "DBEAFE",
      bg: "EFF6FF",
      surface: "FFFFFF",
      text: "0F172A",
      muted: "64748B",
      onPrimary: "FFFFFF",
      line: "BFDBFE",
    },
    fonts: SANS,
    pdfFonts: HELV,
    dark: false,
    ornament: "pill",
    bulletStyle: "dot",
    swatch: ["#EFF6FF", "#3B82F6"],
  },
};

export function getTheme(id: string | undefined | null): Theme {
  if (id && id in THEMES) return THEMES[id as ThemeId];
  return THEMES.mono;
}

export const THEME_LIST = Object.values(THEMES);

export function themePromptList(): string {
  return THEME_LIST.map((t) => `- "${t.id}": ${t.description}. Best for: ${t.bestFor}.`).join("\n");
}
