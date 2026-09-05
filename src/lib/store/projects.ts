import type { AgentResponse, DocumentSpec, Format, Outline } from "@/lib/spec/types";

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  response?: AgentResponse;
  answered?: boolean;
  answers?: Record<string, string>;
  attachedNames?: string[];
};

export type StoredAttachment = { id: string; name: string; size: number; kind: string; text: string; chars: number; pages?: number; dataUrl?: string; mimeType?: string; isImage?: boolean };

export type ProjectStatus = "planning" | "draft" | "generated";

export type Project = {
  id: string;
  title: string;
  docType: string;
  format: Format;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  sectionCount: number;
  sourceFiles: string[];
  preferredFormat: Format | "auto";
  outline?: Outline;
  spec?: DocumentSpec;
  messages: StoredMessage[];
  attachments: StoredAttachment[];
};

const KEY = "folio.projects.v2";
const LIMIT = 60;
const EVENT = "folio:projects";

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function listProjects(): Project[] {
  if (!canStore()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Project[];
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function getProject(id: string): Project | undefined {
  return listProjects().find((p) => p.id === id);
}

function persist(list: Project[]) {
  if (!canStore()) return;
  const trimmed = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded: drop heavy fields from older projects and retry once.
    const lighter = trimmed.map((p, i) => (i > 8 ? { ...p, attachments: [], messages: p.messages.slice(-4) } : p));
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lighter));
    } catch {
      /* give up silently */
    }
  }
  window.dispatchEvent(new Event(EVENT));
}

export function saveProject(project: Project) {
  const list = listProjects().filter((p) => p.id !== project.id);
  list.push(project);
  persist(list);
}

export function deleteProject(id: string) {
  persist(listProjects().filter((p) => p.id !== id));
}

export function subscribe(cb: () => void): () => void {
  if (!canStore()) return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function newId(prefix = "p"): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** Short, human title derived from the first prompt. */
export function titleFromPrompt(prompt: string): string {
  const line = prompt.trim().split(/\n/)[0].replace(/\s+/g, " ");
  const cleaned = line.replace(/^(please\s+)?(create|make|write|build|draft|generate|design|prepare)\s+(me\s+)?(a|an|the)?\s*/i, "");
  const text = cleaned || line;
  return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text || "New project";
}
