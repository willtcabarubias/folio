"use client";

export type NoteAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  isImage: boolean;
};

export type Note = {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd
  body: string;
  attachments: NoteAttachment[];
  createdAt: number;
  updatedAt: number;
};

const KEY = "folio.notes.v1";
const EVENT = "folio:notes";

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function newNoteId(): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `n_${Date.now().toString(36)}_${rand}`;
}

export function listNotes(): Note[] {
  if (!canStore()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Note[];
    if (!Array.isArray(list)) return [];
    return list
      .map((n) => ({ ...n, attachments: Array.isArray((n as Note).attachments) ? (n as Note).attachments : [] }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function getNote(id: string): Note | undefined {
  return listNotes().find((n) => n.id === id);
}

function persist(list: Note[]) {
  if (!canStore()) return;
  const sorted = list.sort((a, b) => b.updatedAt - a.updatedAt);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sorted));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function saveNote(note: Note) {
  const list = listNotes().filter((n) => n.id !== note.id);
  list.push({ ...note, updatedAt: Date.now() });
  persist(list);
}

export function deleteNote(id: string) {
  persist(listNotes().filter((n) => n.id !== id));
}

export function createNote(partial?: Partial<Pick<Note, "title" | "date" | "body" | "attachments">>): Note {
  const now = Date.now();
  const note: Note = {
    id: newNoteId(),
    title: partial?.title ?? "",
    date: partial?.date ?? todayISO(),
    body: partial?.body ?? "",
    attachments: partial?.attachments ?? [],
    createdAt: now,
    updatedAt: now,
  };
  saveNote(note);
  return note;
}

export function subscribeNotes(cb: () => void): () => void {
  if (!canStore()) return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export { todayISO };
