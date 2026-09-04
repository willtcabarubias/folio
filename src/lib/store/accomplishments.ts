"use client";

export type AccomplishmentAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  isImage: boolean;
};

export type Accomplishment = {
  id: string;
  title: string;
  budget: number | null; // PHP pesos, numeric
  date: string; // yyyy-mm-dd
  body: string;
  imageDataUrl: string | null; // single primary image, base64 (kept for compat)
  attachments: AccomplishmentAttachment[];
  createdAt: number;
  updatedAt: number;
};

const KEY = "folio.accomplishments.v1";
const EVENT = "folio:accomplishments";

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function newAccomplishmentId(): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `a_${Date.now().toString(36)}_${rand}`;
}

export function listAccomplishments(): Accomplishment[] {
  if (!canStore()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Accomplishment[];
    if (!Array.isArray(list)) return [];
    return list
      .map((a) => ({ ...a, attachments: Array.isArray((a as Accomplishment).attachments) ? (a as Accomplishment).attachments : [], imageDataUrl: a.imageDataUrl ?? null }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function getAccomplishment(id: string): Accomplishment | undefined {
  return listAccomplishments().find((a) => a.id === id);
}

function persist(list: Accomplishment[]) {
  if (!canStore()) return;
  const sorted = list.sort((a, b) => b.updatedAt - a.updatedAt);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sorted));
  } catch {
    // quota: drop images/attachments from oldest to save space
    const lighter = sorted.map((a, i) => (i > 3 ? { ...a, imageDataUrl: null, attachments: [] } : i > 1 ? { ...a, attachments: a.attachments.slice(0, 2) } : a));
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lighter));
    } catch {}
  }
  window.dispatchEvent(new Event(EVENT));
}

export function saveAccomplishment(item: Accomplishment) {
  const list = listAccomplishments().filter((a) => a.id !== item.id);
  list.push({ ...item, updatedAt: Date.now() });
  persist(list);
}

export function deleteAccomplishment(id: string) {
  persist(listAccomplishments().filter((a) => a.id !== id));
}

export function createAccomplishment(partial?: Partial<Pick<Accomplishment, "title" | "budget" | "date" | "body" | "imageDataUrl" | "attachments">>): Accomplishment {
  const now = Date.now();
  const item: Accomplishment = {
    id: newAccomplishmentId(),
    title: partial?.title ?? "",
    budget: partial?.budget ?? null,
    date: partial?.date ?? todayISO(),
    body: partial?.body ?? "",
    imageDataUrl: partial?.imageDataUrl ?? null,
    attachments: partial?.attachments ?? [],
    createdAt: now,
    updatedAt: now,
  };
  saveAccomplishment(item);
  return item;
}

export function formatPeso(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
}

export function subscribeAccomplishments(cb: () => void): () => void {
  if (!canStore()) return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export { todayISO as todayISOAcc };
