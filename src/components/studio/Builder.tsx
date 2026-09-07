"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bot, Check, Loader2, MessageSquare, Paperclip, Pencil, ScanEye, Sparkles } from "lucide-react";
import { ApiError, askAgent, downloadBlob, expandOutline, expandOutlineStream, extractFile, renderFile, renderPreview, reportApiError } from "@/lib/client/api";
import type { AgentResponse, Attachment, ChatTurn, DocumentSpec, Format, Outline } from "@/lib/spec/types";
import { extractCoverHeader, isHeaderOnlyRequest, isRemakeRequest, mergeHeader } from "@/lib/spec/intent";
import { applySpecPatch, diffOutlines, explicitRemovalTitles, mergeOutlinePreserving } from "@/lib/spec/patch";

import { getProject, newId, saveProject, type Project } from "@/lib/store/projects";
import { ChatThread, type ThreadMessage } from "./ChatThread";
import { EditablePreview } from "./EditablePreview";
import { OutlineEditor } from "./OutlineEditor";
import { PdfPreview } from "./PdfPreview";
import { PromptBox } from "./PromptBox";
import { TopBar, type ExportKind, type ShareKind } from "./TopBar";
import type { GenState } from "./SettingsPanel";


type Pane = "chat" | "doc";
/** Document pane view: outline plan, true-file preview (default), or fluid card editor. */
type Tab = "outline" | "preview" | "edit";

function isGreetingTitle(t: string): boolean {
  const s = t.trim().toLowerCase();
  return /^(hi|hello|hey|yo|sup|howdy|greetings|good (morning|afternoon|evening))[\s!.,]*$/.test(s) || s.length <= 2;
}

function fingerprint(o: Outline): string {
  return JSON.stringify([o.format, o.title, o.subtitle, o.header ?? null, o.docType, o.audience, o.tone, o.purpose ?? null, o.language, o.pageSize, o.targetLength, o.requestedWords ?? null, o.sections.map((s) => [s.title, s.layout, s.points])]);
}

function compactResponse(r: AgentResponse | undefined, text: string): string {
  if (!r) return JSON.stringify({ kind: "reply", message: text });
  if (r.kind === "outline") {
    const o = r.outline;
    // Keep full context: purpose + header + pageSize must survive multi-turn edits.
    return JSON.stringify({
      kind: "outline",
      message: r.message,
      outline: { title: o.title, subtitle: o.subtitle, header: o.header ?? null, format: o.format, docType: o.docType, purpose: o.purpose ?? null, audience: o.audience, tone: o.tone, language: o.language, pageSize: o.pageSize, targetLength: o.targetLength, lengthSource: o.lengthSource, requestedWords: o.requestedWords ?? null, sections: o.sections },
    });
  }
  return JSON.stringify(r);
}

export function Builder({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<"loading" | "ready" | "missing">("loading");
  const [title, setTitle] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [committedAttachments, setCommittedAttachments] = useState<Attachment[]>([]);
  const [outline, setOutlineState] = useState<Outline | null>(null);
  const [spec, setSpec] = useState<DocumentSpec | null>(null);
  const [preferredFormat, setPreferredFormat] = useState<Format | "auto">("auto");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<GenState>({ status: "idle" });
  const [preview, setPreview] = useState<{ data: ArrayBuffer; format: Format } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("outline");
  const [pane, setPane] = useState<Pane>("doc");
  // Autosave runs silently in the background (no manual save button in the UI).
  const [, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const createdAt = useRef(Date.now());
  const specKey = useRef<string | null>(null);
  const agentStarted = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserEdited = useRef(false);
  const autoGenPending = useRef<{ outline: Outline; transcript: ChatTurn[]; interimId: string; response: AgentResponse } | null>(null);

  const hasGenerated = Boolean(spec);
  const generating = gen.status === "writing" || gen.status === "rendering";
  const hasPendingClarify = useMemo(() => messages.some((m) => m.response?.kind === "clarify" && !m.answered), [messages]);
  const [previewStartIdx, setPreviewStartIdx] = useState<number | null>(null);
  const previewChatMessages = useMemo(() => {
    if (previewStartIdx === null) return [];
    return messages.slice(previewStartIdx).filter((m) => m.id !== "preview-init");
  }, [messages, previewStartIdx]);
  const hasPreviewPendingClarify = useMemo(
    () => previewChatMessages.some((m) => m.response?.kind === "clarify" && !m.answered),
    [previewChatMessages]
  );

  useEffect(() => {
    if (hasGenerated && previewStartIdx === null) {
      const existingIdx = messages.findIndex((m) => m.id === "preview-init");
      if (existingIdx !== -1) {
        setPreviewStartIdx(existingIdx);
      } else {
        setPreviewStartIdx(messages.length);
      }
    } else if (!hasGenerated && previewStartIdx !== null) {
      setPreviewStartIdx(null);
    }
  }, [hasGenerated, previewStartIdx, messages]);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 2200);
  };

  /* ---------------- load ---------------- */

  useEffect(() => {
    const p = getProject(id);
    if (!p) {
      setLoaded("missing");
      return;
    }
    createdAt.current = p.createdAt;
    setMessages(p.messages as ThreadMessage[]);
    setCommittedAttachments(p.attachments.map((a) => ({ ...a, status: "ready" as const })));
    setAttachments([]);
    setOutlineState(p.outline ?? null);
    setSpec(p.spec ?? null);
    setPreferredFormat(p.preferredFormat ?? "auto");
    if (p.spec && p.outline) {
      specKey.current = fingerprint(p.outline);
      setGen({ status: "ready", pages: p.spec.fit?.pages, targetPages: p.spec.targetPages, fitted: p.spec.fit?.fitted, trimmed: p.spec.fit?.trimmed, warnings: [] });
      setTab("preview");
    }
    // Smart title: only treat as user-edited if title is real and not a greeting and differs from outline
    const hasRealTitle = Boolean(p.title && p.title.trim() && !isGreetingTitle(p.title));
    const isEdited = hasRealTitle && (!p.outline || p.title.trim() !== p.outline.title.trim());
    isUserEdited.current = isEdited;
    if (!hasRealTitle) setTitle("");
    else setTitle(p.title);
    setLoaded("ready");
  }, [id]);

  /* ---------------- persistence ---------------- */

  const allReadyAttachments = useMemo(() => [...committedAttachments, ...attachments].filter((a) => a.status === "ready"), [committedAttachments, attachments]);
  const displayTitle = (isUserEdited.current ? title : outline?.title ?? spec?.title ?? title) || spec?.title || outline?.title || title || "Untitled";
  // Word-count plumbing stays internal (budgets/top-up); no chip in the UI.

  const buildProject = useCallback(
    (): Project => ({
      id,
      title: (() => {
        const t = title.trim();
        const o = outline?.title?.trim();
        if (isUserEdited.current) return t || o || "Untitled";
        return o || t || "Untitled";
      })(),
      docType: outline?.docType ?? "",
      format: outline?.format ?? (preferredFormat === "auto" ? "pptx" : preferredFormat),
      status: spec ? "generated" : outline ? "draft" : "planning",
      createdAt: createdAt.current,
      updatedAt: Date.now(),
      sectionCount: outline?.sections.length ?? 0,
      sourceFiles: allReadyAttachments.map((a) => a.name),
      preferredFormat,
      outline: outline ?? undefined,
      spec: spec ?? undefined,
      messages: messages.filter((m) => !m.error).map(({ id: mid, role, text, response, answered, answers, attachedNames }) => ({ id: mid, role, text, response, answered, answers, attachedNames })),
      // Persist vision dataUrls too (quota fallback in persist() lightens older projects).
      // Without this, a reload loses the task image and the agent can no longer see it.
      attachments: allReadyAttachments.map(({ id: aid, name, size, kind, text, chars, pages, dataUrl, mimeType, isImage }) => ({ id: aid, name, size, kind, text, chars, pages, ...(dataUrl ? { dataUrl, mimeType, isImage: true } : {}) })),
    }),
    [id, title, outline, spec, allReadyAttachments, messages, preferredFormat],
  );

  const save = useCallback(() => {
    saveProject(buildProject());
    setSaveState("saved");
  }, [buildProject]);

  useEffect(() => {
    if (loaded !== "ready") return;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState("saving");
      save();
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [loaded, save]);

  /* ---------------- attachments ---------------- */

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("Failed to read image"));
      r.readAsDataURL(file);
    });

  const addFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files).slice(0, 6)) {
      if (file.type.startsWith("image/")) {
        if (file.size > 4 * 1024 * 1024) {
          const fid = newId("f");
          setAttachments((prev) => [...prev, { id: fid, name: file.name, size: file.size, kind: "image", text: "", chars: 0, status: "error" as const, error: "Image too large (max 4 MB)" }]);
          reportApiError(new Error("Image too large"), "Image too large (max 4 MB)", "api:extract");
          continue;
        }
        const fid = newId("f");
        setAttachments((prev) => [...prev, { id: fid, name: file.name, size: file.size, kind: "image", text: "", chars: 0, status: "extracting" as const }]);
        try {
          const dataUrl = await fileToDataUrl(file);
          setAttachments((prev) => prev.map((a) => (a.id === fid ? { ...a, status: "ready" as const, dataUrl, mimeType: file.type, isImage: true } : a)));
        } catch (err) {
          reportApiError(err, "Could not read image", "api:extract");
          const message = err instanceof Error ? err.message : "Could not read image";
          setAttachments((prev) => prev.map((a) => (a.id === fid ? { ...a, status: "error" as const, error: message } : a)));
        }
        continue;
      }
      const fid = newId("f");
      setAttachments((prev) => [...prev, { id: fid, name: file.name, size: file.size, kind: "", text: "", chars: 0, status: "extracting" }]);
      try {
        const result = await extractFile(file);
        setAttachments((prev) => prev.map((a) => (a.id === fid ? { ...a, ...result, status: "ready" } : a)));
      } catch (err) {
        reportApiError(err, "Could not read this file", "api:extract");
        const message = err instanceof Error ? err.message : "Could not read this file";
        setAttachments((prev) => prev.map((a) => (a.id === fid ? { ...a, status: "error", error: message } : a)));
      }
    }
  }, []);

  /* ---------------- agent ---------------- */

  const setOutline = useCallback((next: Outline) => {
    setOutlineState(next);
    if (!isUserEdited.current || !title.trim() || isGreetingTitle(title)) setTitle(next.title);
  }, [title]);

  const transcript = useMemo<ChatTurn[]>(() => messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.text })), [messages]);
  // stale kept for future use (outline edits) — settings removed
  const stale = Boolean(outline && specKey.current && specKey.current !== fingerprint(outline));

  const loadPreview = useCallback(async (s: DocumentSpec, format: Format) => {
    setPreviewBusy(true);
    try {
      const data = await renderPreview(s, format);
      setPreview({ data, format });
      return true;
    } catch (err) {
      reportApiError(err, "Preview failed", "client:preview");
      // Do NOT clobber a successful deck into error if spec already renders (cards visible).
      // Keep the editable deck usable; surface error in global log instead of ghost Regenerate overlay.
      const isTimeout = err instanceof ApiError && (err.status === 504 || err.status === 408);
      const msg = err instanceof Error ? err.message : "Preview failed";
      // Only mark generation as error if we are still in writing/rendering phase without a spec.
      // For restore-path, keep ready and show toast instead.
      setGen((prev) => {
        if (prev.status === "rendering" || prev.status === "writing") {
          // Caller (doGenerate) will decide; don't force error here for timeout – let caller keep ready with warning.
          if (isTimeout && s.blocks.length > 0) return { status: "ready", warnings: [msg] } as unknown as typeof prev;
          return { status: "error", message: msg };
        }
        // Already ready – keep ready, just warn
        return prev;
      });
      if (isTimeout) {
        // Non-blocking: deck stays
        return false;
      }
      return false;
    } finally {
      setPreviewBusy(false);
    }
  }, []);

  // Restore the preview for a previously generated project.
  useEffect(() => {
    if (loaded === "ready" && spec && !preview && !previewBusy && gen.status === "ready") void loadPreview(spec, spec.format);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, spec]);

  // Preview refresh flag: set on manual spec edits, consumed by the debounced
  // re-render effect below (no loop: loadPreview never touches this flag).
  const [needsPreview, setNeedsPreview] = useState(false);

  // Re-render the true-file preview after manual edits (debounced; never loops:
  // loadPreview only touches preview/previewBusy, never spec or needsPreview).
  useEffect(() => {
    if (!spec || !needsPreview || generating || previewBusy || busy || gen.status !== "ready") return;
    const t = setTimeout(() => {
      setNeedsPreview(false);
      void loadPreview(spec, spec.format);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, needsPreview, generating, previewBusy, busy, gen.status]);

  const doGenerateRef = useRef<((targetOutline: Outline, transcriptOverride?: ChatTurn[]) => Promise<void>) | null>(null);
  const doGenerate = useCallback(async (targetOutline: Outline, transcriptOverride?: ChatTurn[]) => {
    const effectiveTitle = (() => {
      const t = title.trim();
      if (isUserEdited.current) return t || targetOutline.title;
      return targetOutline.title || t;
    })();
    const target: Outline = { ...targetOutline, title: effectiveTitle };
    const tr = transcriptOverride ?? transcript;
    setGen({ status: "writing" });
    setTab("preview");
    setPane("doc");
    // Create skeleton spec so preview shows immediately and streams cards.
    // Full-regenerate path only — partial edits use doGenerateSections and never wipe.
    const skeleton: DocumentSpec = {
      title: target.title,
      subtitle: target.subtitle,
      header: target.header,
      docType: target.docType,
      purpose: target.purpose,
      audience: target.audience,
      tone: target.tone,
      language: target.language,
      theme: target.theme,
      pageSize: target.pageSize,
      targetLength: target.targetLength,
      requestedWords: target.requestedWords,
      blocks: [],
      format: target.format,
    } as unknown as DocumentSpec;
    setSpec(skeleton);
    setPreview(null);
    try {
      let finalSpec: DocumentSpec | null = null;
      let warnings: string[] = [];
      // Stream blocks one by one — true LLM streaming via SSE (batch-sequential)
      for await (const evt of expandOutlineStream({
        outline: target,
        transcript: tr,
        attachments: allReadyAttachments.map((a) => ({ name: a.name, text: a.text, ...(a.dataUrl ? { dataUrl: a.dataUrl, mimeType: a.mimeType, isImage: true } : {}) })),
      })) {
        if (evt.type === "block") {
          // Bulletproof streaming: key by id in a Map, never store undefined holes.
          // Out-of-order or duplicate events can't crash EditablePreview.
          const incoming = evt.block as DocumentSpec["blocks"][number];
          if (!incoming || typeof incoming.id !== "string" || !incoming.id) continue;
          // Sanitize minimal shape (writer may omit bullets/title).
          const safe = {
            ...incoming,
            title: typeof incoming.title === "string" && incoming.title.trim() ? incoming.title : "Untitled",
            bullets: Array.isArray(incoming.bullets) ? incoming.bullets : [],
          } as DocumentSpec["blocks"][number];
          setSpec((prev) => {
            const base = prev ?? skeleton;
            const byId = new Map<string, DocumentSpec["blocks"][number]>();
            for (const b of base.blocks) {
              if (b && typeof b.id === "string" && b.id) byId.set(b.id, b);
            }
            byId.set(safe.id, safe);
            // Preserve outline order; append unknown ids (e.g. topup) at end.
            const ordered: DocumentSpec["blocks"][number][] = [];
            for (const s of target.sections) {
              const hit = byId.get(s.id);
              if (hit) {
                ordered.push(hit);
                byId.delete(s.id);
              }
            }
            for (const rest of byId.values()) ordered.push(rest);
            return { ...base, blocks: ordered } as DocumentSpec;
          });
        } else if (evt.type === "done") {
          if ("partial" in evt && (evt as { partial?: boolean }).partial) continue;
          finalSpec = (evt as { spec: DocumentSpec }).spec;
          warnings = (evt as { warnings: string[] }).warnings;
        }
      }
      if (!finalSpec) throw new Error("Generation ended without result");
      const produced = finalSpec;
      specKey.current = fingerprint(targetOutline);
      setGen({ status: "rendering" });
      // Preview may 504 on Hobby (10s). Don't lose the deck – keep spec and mark ready with warning.
      const previewOk = await loadPreview(produced, target.format);
      setSpec(produced);
      if (!previewOk) {
        // Check if loadPreview already pushed - keep ready but surface warning in log
        setGen({ status: "ready", pages: produced.fit?.pages, targetPages: produced.targetPages, fitted: produced.fit?.fitted, trimmed: produced.fit?.trimmed, warnings: [...warnings, "Preview timed out (Vercel Hobby 10s) – deck is still usable. Export may hit same limit."] });
        showToast("Deck ready – preview hit Hobby timeout, see error log");
      } else {
        setGen({ status: "ready", pages: produced.fit?.pages, targetPages: produced.targetPages, fitted: produced.fit?.fitted, trimmed: produced.fit?.trimmed, warnings });
        showToast("Preview updated");
      }
      if (autoGenPending.current && doGenerateRef.current) {
        const pending = autoGenPending.current;
        autoGenPending.current = null;
        setTimeout(async () => {
          try {
            await doGenerateRef.current?.(pending.outline, pending.transcript);
            setMessages((prev) => prev.map((m) => (m.id === pending.interimId ? { id: pending.interimId, role: "assistant", text: pending.response.message, response: pending.response } : m)));
          } catch {
            setMessages((prev) => prev.map((m) => (m.id === pending.interimId ? { id: pending.interimId, role: "assistant", text: `${pending.response.message} — update failed, please retry`, response: pending.response } : m)));
          }
        }, 250);
      }
    } catch (err) {
      reportApiError(err, "Generation failed", "api:expand");
      setGen({ status: "error", message: err instanceof Error ? err.message : "Generation failed" });
      showToast(err instanceof Error ? err.message : "Generation failed");
    }
  }, [title, transcript, allReadyAttachments, loadPreview]);
  useEffect(() => {
    doGenerateRef.current = doGenerate;
  }, [doGenerate]);

  /**
   * Patch path: (re)write ONLY the given section ids and merge into the live spec.
   * Untouched blocks are never wiped, never re-rendered by the LLM — this is what
   * makes "add X / remove Y / add 2 pages" reliable and cheap.
   */
  const doGenerateSections = useCallback(async (targetOutline: Outline, sectionIds: string[], transcriptOverride?: ChatTurn[]) => {
    if (!sectionIds.length) return;
    const tr = transcriptOverride ?? transcript;
    const prevSpec = spec;
    setGen({ status: "writing" });
    try {
      const incomingById = new Map<string, DocumentSpec["blocks"][number]>();
      let warnings: string[] = [];
      for await (const evt of expandOutlineStream({
        outline: targetOutline,
        transcript: tr,
        attachments: allReadyAttachments.map((a) => ({ name: a.name, text: a.text, ...(a.dataUrl ? { dataUrl: a.dataUrl, mimeType: a.mimeType, isImage: true } : {}) })),
        sectionIds,
      } as Parameters<typeof expandOutlineStream>[0])) {
        if (evt.type === "block") {
          const incoming = evt.block as DocumentSpec["blocks"][number];
          if (!incoming || typeof incoming.id !== "string" || !incoming.id) continue;
          const safe = {
            ...incoming,
            title: typeof incoming.title === "string" && incoming.title.trim() ? incoming.title : "Untitled",
            bullets: Array.isArray(incoming.bullets) ? incoming.bullets : [],
          } as DocumentSpec["blocks"][number];
          incomingById.set(safe.id, safe);
          // Live-merge each streamed block so the UI updates without wiping others.
          setSpec((prev) => {
            if (!prev) return prev;
            const byId = new Map(prev.blocks.map((b) => [b.id, b]));
            byId.set(safe.id, safe);
            const ordered: DocumentSpec["blocks"][number][] = [];
            for (const s of targetOutline.sections) {
              const hit = byId.get(s.id);
              if (hit) {
                ordered.push(hit);
                byId.delete(s.id);
              }
            }
            for (const rest of byId.values()) {
              if (!ordered.some((x) => x.id === rest.id)) ordered.push(rest);
            }
            return { ...prev, header: targetOutline.header, blocks: ordered };
          });
        } else if (evt.type === "done") {
          warnings = (evt as { warnings: string[] }).warnings ?? [];
          const partialBlocks = (evt as { blocks?: DocumentSpec["blocks"] }).blocks;
          if (partialBlocks?.length) {
            for (const b of partialBlocks) if (b?.id) incomingById.set(b.id, b);
          }
        }
      }
      if (!incomingById.size) throw new Error("Update ended without result — keeping your current file");
      // Final authoritative merge (handles removals + order).
      const fresh = targetOutline.sections
        .map((s) => incomingById.get(s.id))
        .filter((b): b is DocumentSpec["blocks"][number] => Boolean(b));
      setSpec((prev) => {
        const base = prev ?? prevSpec;
        if (!base) return base;
        // Drop blocks whose sections were explicitly removed; keep everything else.
        const wanted = new Set(targetOutline.sections.map((s) => s.id));
        const kept = base.blocks.filter((b) => wanted.has(b.id) || incomingById.has(b.id));
        const merged = applySpecPatch({ ...base, blocks: kept }, fresh, targetOutline.header);
        // Re-order to outline order.
        const byId = new Map(merged.blocks.map((b) => [b.id, b]));
        const ordered: DocumentSpec["blocks"][number][] = [];
        for (const s of targetOutline.sections) {
          const hit = byId.get(s.id);
          if (hit) {
            ordered.push(hit);
            byId.delete(s.id);
          }
        }
        for (const rest of byId.values()) ordered.push(rest);
        return { ...merged, header: targetOutline.header, blocks: ordered };
      });
      specKey.current = fingerprint(targetOutline);
      setGen({ status: "rendering" });
      const cur = spec;
      void cur;
      // Preview from merged spec (read fresh in next tick via effect below).
      setNeedsPreview(true);
      setGen({ status: "ready", warnings });
      showToast("Updated — rest of the file untouched");
    } catch (err) {
      reportApiError(err, "Update failed", "api:expand");
      setGen({ status: "error", message: err instanceof Error ? err.message : "Update failed" });
      showToast(err instanceof Error ? err.message : "Update failed");
    }
  }, [transcript, allReadyAttachments, spec]);
  useEffect(() => {
    doGenerateRef.current = doGenerate;
  }, [doGenerate]);

  // (settings removed — no bounce needed)

  const generate = async () => {
    if (!outline) return;
    await doGenerate(outline);
  };

  // Handle spec edits from EditablePreview (inline edit / layout / reorder)
  const handleSpecChange = useCallback((next: DocumentSpec) => {
    setSpec(next);
    setNeedsPreview(true);
    // keep preview stale tracking: spec edits are source of truth, don't mark stale
    // but we update title sync if needed
  }, []);

  const runAgent = useCallback(
    async (list: ThreadMessage[], currentOutline: Outline | null, files: Attachment[], preferred: Format | "auto") => {
      // Pre-agent fast path: pure cover-header edits apply instantly with zero LLM cost
      // and zero regeneration risk. The planner is bypassed entirely.
      const _lastUser = list.filter((m) => !m.error).slice(-1).find((m) => m.role === "user")?.text ?? "";
      if (currentOutline && spec && isHeaderOnlyRequest(_lastUser) && !isRemakeRequest(_lastUser)) {
        const fromUser = extractCoverHeader(_lastUser);
        if (fromUser && (fromUser.group || fromUser.members?.length)) {
          const mergedH = mergeHeader(currentOutline.header, fromUser);
          const patched = { ...currentOutline, ...(mergedH ? { header: mergedH } : {}) };
          setOutlineState(patched);
          setSpec((prev) => (prev ? { ...prev, header: patched.header } : prev));
          setNeedsPreview(true);
          specKey.current = fingerprint(patched);
          const label = [mergedH?.group, mergedH?.subject, mergedH?.section, mergedH?.members?.length ? `${mergedH.members.length} member${mergedH.members.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
          setMessages((prev) => [...prev, { id: newId("m"), role: "assistant", text: `Done — cover header updated${label ? ` (${label})` : ""}. Nothing else changed.` }]);
          showToast("Header updated — content untouched");
          return;
        }
      }
      setBusy(true);
      try {
        const response = await askAgent({
          messages: list.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.role === "assistant" ? compactResponse(m.response, m.text) : m.text })),
          attachments: files.filter((a) => a.status === "ready").map((a) => ({ name: a.name, text: a.text, ...(a.dataUrl ? { dataUrl: a.dataUrl, mimeType: a.mimeType, isImage: true } : {}) })),
          currentOutline,
          preferredFormat: preferred,
        });
        if (response.kind === "outline") {
          const lastUserText = list.filter((m) => m.role === "user").slice(-1)[0]?.text ?? "";
          const userAskedTitleChange = /title|rename|headline|call it|name it/i.test(lastUserText);
          const allowRemake = isRemakeRequest(lastUserText);
          const formatSwitched = Boolean(currentOutline && response.outline.format !== currentOutline.format);
          // Deterministic header restore on the client too (instant, no round-trip).
          // Priority: saved header <- LLM header <- words in this turn.
          let planned: Outline = response.outline;
          try {
            const fromUser = extractCoverHeader(lastUserText);
            const mergedH = mergeHeader(mergeHeader(currentOutline?.header && !allowRemake ? currentOutline.header : undefined, planned.header), fromUser);
            planned = { ...planned, ...(mergedH ? { header: mergedH } : {}) };
            if (currentOutline && !allowRemake && !formatSwitched) {
              planned = mergeOutlinePreserving(currentOutline, planned, {
                allowRemake: false,
                formatSwitched: false,
                explicitRemovals: explicitRemovalTitles(lastUserText),
              });
            }
          } catch {
            planned = response.outline;
          }
          const finalResponse: AgentResponse = planned !== response.outline ? { ...response, outline: planned } : response;
          setOutlineState(planned);
          setTitle((t) => {
            const cur = t.trim();
            if (!isUserEdited.current || !cur || isGreetingTitle(cur) || userAskedTitleChange) return planned.title;
            return t;
          });
          setPreferredFormat(planned.format);

          // After answers, directly create file and redirect to preview (no outline phase)
          const interimId = newId("m");
          const isPatch = Boolean(currentOutline && spec && !allowRemake && !formatSwitched);
          const interimText = isPatch ? `${finalResponse.message} — Updating…` : `${finalResponse.message} — Composing…`;
          const interimResponse: AgentResponse = { ...finalResponse, message: interimText } as AgentResponse;
          const interimMsg: ThreadMessage = { id: interimId, role: "assistant", text: interimText, response: interimResponse };
          setMessages((prev) => [...prev, interimMsg]);
          setPane("doc");
          setTab("preview");
          const updatedTranscript: ChatTurn[] = [
            ...list.filter((m) => !m.error).map((m) => ({ role: m.role as "user" | "assistant", content: m.role === "assistant" ? compactResponse(m.response, m.text) : m.text })),
            { role: "assistant" as const, content: finalResponse.message },
          ];

          const finishOk = (msg: string, resp: AgentResponse) =>
            setMessages((prev) => prev.map((m) => (m.id === interimId ? { id: interimId, role: "assistant", text: msg, response: resp } : m)));
          const finishFail = (msg: string, resp: AgentResponse) =>
            setMessages((prev) => prev.map((m) => (m.id === interimId ? { id: interimId, role: "assistant", text: msg, response: resp } : m)));

          // Fast path 1: header-only ("put Group 1 + names on top") — no regeneration at all.
          const _diff0 = currentOutline ? diffOutlines(currentOutline, planned) : null;
          const _headerOnly = Boolean(_diff0 && (isHeaderOnlyRequest(lastUserText) || (!allowRemake && !_diff0.added.length && !_diff0.removed.length && !_diff0.changed.length && _diff0.headerChanged)));
          if (currentOutline && spec && _headerOnly) {
            setSpec((prev) => (prev ? { ...prev, header: planned.header, title: planned.title } : prev));
            setNeedsPreview(true);
            specKey.current = fingerprint(planned);
            showToast("Header updated — content untouched");
            finishOk(finalResponse.message, finalResponse);
            return;
          }

          if (generating || previewBusy) {
            autoGenPending.current = { outline: planned, transcript: updatedTranscript, interimId, response: finalResponse };
            showToast("Queued");
          } else if (!currentOutline || !spec || allowRemake || formatSwitched) {
            showToast(allowRemake ? "Remaking file…" : "Composing");
            try {
              await doGenerate(planned, updatedTranscript);
              finishOk(finalResponse.message, finalResponse);
            } catch {
              finishFail(`${finalResponse.message} — generation failed, please retry`, finalResponse);
            }
          } else {
            // Patch path: diff old vs new, only (re)write what changed.
            const diff = diffOutlines(currentOutline, planned);
            const touchedIds = [...diff.added.map((s) => s.id), ...diff.changed.map((c) => c.next.id)];
            const totalSections = Math.max(1, planned.sections.length);
            const isBigChange = diff.keptRatio < 0.5 || touchedIds.length > 6 || touchedIds.length / totalSections > 0.5;
            if (!diff.added.length && !diff.changed.length) {
              // Header/title/removal-only (or no-op): filter locally, no LLM expand call.
              const wanted = new Set(planned.sections.map((s) => s.id));
              setSpec((prev) => (prev ? { ...prev, header: planned.header, title: planned.title, blocks: prev.blocks.filter((b) => wanted.has(b.id)) } : prev));
              setNeedsPreview(true);
              specKey.current = fingerprint(planned);
              showToast(diff.removed.length ? "Removed — rest untouched" : "Updated — content untouched");
              finishOk(finalResponse.message, finalResponse);
            } else if (isBigChange) {
              showToast("Composing");
              try {
                await doGenerate(planned, updatedTranscript);
                finishOk(finalResponse.message, finalResponse);
              } catch {
                finishFail(`${finalResponse.message} — generation failed, please retry`, finalResponse);
              }
            } else {
              showToast("Updating…");
              try {
                await doGenerateSections(planned, touchedIds, updatedTranscript);
                finishOk(finalResponse.message, finalResponse);
              } catch {
                finishFail(`${finalResponse.message} — update failed, please retry`, finalResponse);
              }
            }
          }
        } else {
          // clarify / reply — show immediately, no file mutation
          const newAssistant: ThreadMessage = { id: newId("m"), role: "assistant", text: response.message, response };
          setMessages((prev) => [...prev, newAssistant]);
        }
      } catch (err) {
        reportApiError(err, "Agent error", "api:agent");
        const message = err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => [...prev, { id: newId("e"), role: "assistant", text: message, error: true }]);
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, generating, previewBusy, doGenerate, doGenerateSections],
  );

  // Kick off the planner when arriving from the home page (last message is the user's, unanswered).
  // Use allReadyAttachments (committed + pending) so Home-attached file is delivered together with "explain this"
  useEffect(() => {
    if (loaded !== "ready" || agentStarted.current) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "user" && !busy) {
      agentStarted.current = true;
      void runAgent(messages, outline, allReadyAttachments, preferredFormat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const send = (text: string) => {
    const trimmed = text.trim();
    const extracting = attachments.some((a) => a.status === "extracting");
    if (!trimmed || busy || generating || extracting) return;
    const ready = attachments.filter((a) => a.status === "ready");
    const attachedNames = ready.map((a) => a.name);
    const next: ThreadMessage[] = [...messages.filter((m) => !m.error), { id: newId("u"), role: "user" as const, text: trimmed, ...(attachedNames.length ? { attachedNames } : {}) }];
    setMessages(next);
    setInput("");
    if (ready.length) {
      setCommittedAttachments((prev) => [...prev, ...ready]);
      setAttachments((prev) => prev.filter((a) => a.status !== "ready"));
    }
    const combined = [...committedAttachments, ...ready];
    void runAgent(next, outline, combined, preferredFormat);
  };

  const retry = () => {
    const clean = messages.filter((m) => !m.error);
    if (!clean.length || clean[clean.length - 1].role !== "user") return;
    setMessages(clean);
    void runAgent(clean, outline, allReadyAttachments, preferredFormat);
  };

  const answerWith = (msg: ThreadMessage, map: Record<string, string>, text: string) => {
    const updated = messages.map((m) => (m.id === msg.id ? { ...m, answered: true, answers: map } : m));
    const ready = attachments.filter((a) => a.status === "ready");
    const attachedNames = ready.map((a) => a.name);
    const next: ThreadMessage[] = [...updated.filter((m) => !m.error), { id: newId("u"), role: "user" as const, text, ...(attachedNames.length ? { attachedNames } : {}) }];
    setMessages(next);
    if (ready.length) {
      setCommittedAttachments((prev) => [...prev, ...ready]);
      setAttachments((prev) => prev.filter((a) => a.status !== "ready"));
    }
    const combined = [...committedAttachments, ...ready];
    void runAgent(next, outline, combined, preferredFormat);
  };
  const onAnswer = (msg: ThreadMessage, answers: { question: string; answer: string }[]) => {
    const map: Record<string, string> = {};
    if (msg.response?.kind === "clarify") msg.response.questions.forEach((q, i) => (map[q.id] = answers[i]?.answer ?? ""));
    answerWith(msg, map, `My answers:\n${answers.map((a) => `• ${a.question} → ${a.answer}`).join("\n")}`);
  };
  const onSkip = (msg: ThreadMessage) => {
    const map: Record<string, string> = {};
    if (msg.response?.kind === "clarify") msg.response.questions.forEach((q) => (map[q.id] = q.recommended ?? q.options[0] ?? ""));
    answerWith(msg, map, "Use the recommended options and go ahead with the outline.");
  };

  /* ---------------- export ---------------- */

  const currentSpec = (): DocumentSpec | null => {
    if (!spec) return null;
    const effectiveTitle = (() => {
      const t = title.trim();
      if (isUserEdited.current) return t || outline?.title || spec.title;
      return outline?.title || t || spec.title;
    })();
    return { ...spec, title: effectiveTitle, header: outline?.header ?? spec.header, pageSize: outline?.pageSize ?? spec.pageSize };
  };

  const exportAs = async (kind: ExportKind) => {
    if (generating || previewBusy) {
      showToast("File is still updating — please wait a moment");
      return;
    }
    const s = currentSpec();
    if (!s || exporting) return;
    // Preflight: non-Latin scripts can't PDF directly — guide to DOCX early (no wasted render).
    // Keep light: only check title+headings client-side; server does full ratio check.
    if (kind === "pdf") {
      const sample = [s.title, ...(s.blocks.slice(0, 3).map((b) => b.title ?? ""))].join(" ");
      const nonLatin = (sample.match(/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u0600-\u06FF]/g) ?? []).length;
      if (nonLatin >= 3) {
        showToast("This language exports best as DOCX — rendering PDF may drop characters");
      }
    }
    setExporting(kind);
    try {
      const { blob, fileName, convertedFrom, warnings } = await renderFile(s, kind);
      downloadBlob(blob, fileName);
      if (convertedFrom) {
        showToast(`Export ready (converted ${convertedFrom.replace("from-", "").toUpperCase()} → ${kind.toUpperCase()} — check layout)`);
      } else if (warnings) {
        showToast(`Export ready — ${warnings.split(" | ")[0].slice(0, 90)}`);
      } else {
        showToast("Export ready");
      }
    } catch (err) {
      reportApiError(err, "Export failed", "api:render");
      showToast(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const share = async (kind: ShareKind) => {
    try {
      if (kind === "link") {
        await navigator.clipboard.writeText(window.location.href);
        showToast("Link copied");
      } else {
        const s = currentSpec();
        if (!s) return;
        const { blob, fileName } = await renderFile(s, "pdf");
        const file = new File([blob], fileName, { type: "application/pdf" });
        if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          await navigator.share({ files: [file], title: s.title });
        } else {
          downloadBlob(blob, fileName);
          showToast("Sharing is not available here — PDF downloaded");
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      reportApiError(err, "Could not share", "api:render");
      showToast(err instanceof Error ? err.message : "Could not share");
    }
  };

  /* ---------------- render ---------------- */

  if (loaded === "loading") return <div className="flex h-screen items-center justify-center bg-shell text-sm text-muted">Loading</div>;
  if (loaded === "missing") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-shell text-center">
        <p className="text-lg font-semibold tracking-tight text-ink md:text-base">Project not found</p>
        <p className="text-sm text-muted md:text-xs">It may have been deleted from this browser.</p>
        <Link href="/" className="btn-primary mt-2">
          Start a new project
        </Link>
      </div>
    );
  }

  const readyFiles = allReadyAttachments.length;
  const planning = !outline;

  return (
    <div className="flex h-screen flex-col bg-shell">
      <TopBar
        isPlanning={planning}
        isBusy={generating || previewBusy}
        title={displayTitle}
        onTitleChange={(v) => {
          isUserEdited.current = true;
          setTitle(v);
        }}
        canExport={Boolean(spec)}
        exporting={exporting}
        onExport={exportAs}
        onShare={share}
        canShareFile={Boolean(spec)}
        originFormat={(spec as any)?.originFormat || spec?.format}
        status={
          readyFiles > 0 ? (
            <span className="chip chip-brand hidden md:inline-flex">
              <Paperclip size={12} />
              {readyFiles} source{readyFiles > 1 ? "s" : ""}
            </span>
          ) : undefined
        }
      />

        {planning ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="scroll-thin flex-1 overflow-y-auto px-4 md:px-6">
            <div className="mx-auto w-full max-w-3xl py-6 md:py-5">
              <ChatThread messages={messages} busy={busy} onAnswer={onAnswer} onSkip={onSkip} onRetry={retry} />
            </div>
          </div>
          <div className={`shrink-0 border-t border-line/30 bg-white/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur supports-[backdrop-filter]:bg-white/80 md:border-0 md:bg-transparent md:px-6 md:pb-4 md:pt-2 md:backdrop-blur-none ${hasPendingClarify ? "hidden" : ""}`}>
            <div className="mx-auto w-full max-w-3xl">
              <PromptBox value={input} onChange={setInput} onSubmit={() => send(input)} onFiles={addFiles} attachments={attachments} onRemoveAttachment={(fid) => setAttachments((p) => p.filter((a) => a.id !== fid))} busy={busy || attachments.some((a) => a.status === "extracting")} placeholder={attachments.some((a) => a.status === "extracting") ? "Extracting file… please wait" : "Reply or add details"} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Unified switcher (small screens) — Chat | Preview | Edit in one row */}
          <div className="flex items-center justify-center border-b border-line/40 bg-white px-3 py-2 lg:hidden">
            <div className="flex rounded-full bg-[#f4f6f4] p-0.5 ring-1 ring-line/40">
              <button
                type="button"
                onClick={() => setPane("chat")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${pane === "chat" ? "bg-ink text-white" : "text-muted"}`}
              >
                <MessageSquare size={13} />
                Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setPane("doc");
                  setTab("preview");
                }}
                title="Actual file preview"
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${pane === "doc" && tab !== "edit" ? "bg-ink text-white" : "text-muted"}`}
              >
                <ScanEye size={13} />
                Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  setPane("doc");
                  setTab("edit");
                }}
                title="Edit content cards"
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${pane === "doc" && tab === "edit" ? "bg-ink text-white" : "text-muted"}`}
              >
                <Pencil size={13} />
                Edit
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Chat */}
            <aside className={`${pane === "chat" ? "flex" : "hidden"} min-h-0 w-full flex-col border-r border-line/40 bg-white/60 lg:flex lg:w-[340px] lg:md:w-[289px] xl:w-[380px] xl:md:w-[323px]`}>
              <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4 md:px-3 md:py-3">
                {hasGenerated && spec && gen.status !== "writing" && (
                  <div className="mb-4 flex w-full items-start justify-start gap-3 text-left">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-sm ring-1 ring-white/60">
                      <Bot size={14} strokeWidth={1.9} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="inline-flex max-w-[85%] rounded-2xl bg-white px-4 py-2.5 text-left text-[11px] leading-4 text-ink shadow-sm ring-1 ring-line">
                        Done — “{displayTitle}” ready
                      </div>
                    </div>
                  </div>
                )}
                <ChatThread messages={previewChatMessages} busy={busy || generating} busyHint={generating ? "Composing" : undefined} compact onAnswer={onAnswer} onSkip={onSkip} onRetry={retry} />
              </div>
              <div className={`shrink-0 border-t border-line/30 bg-white/90 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur supports-[backdrop-filter]:bg-white/60 md:border-0 md:bg-white/60 md:px-2.5 md:pb-2.5 md:pt-1 ${hasPreviewPendingClarify ? "hidden" : ""}`}>
                <PromptBox value={input} onChange={setInput} onSubmit={() => send(input)} onFiles={addFiles} attachments={attachments} onRemoveAttachment={(fid) => setAttachments((p) => p.filter((a) => a.id !== fid))} busy={busy || generating || attachments.some((a) => a.status === "extracting")} placeholder={attachments.some((a) => a.status === "extracting") ? "Extracting file… please wait" : generating ? "File is updating — please wait" : "Ask for changes"} />
              </div>
            </aside>

            {/* Document */}
            <section className={`${pane === "doc" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col bg-shell lg:flex`}>
              {outline && spec && !generating && (
                <div className="hidden shrink-0 items-center justify-center border-b border-line/40 bg-white/70 px-3 py-1.5 lg:flex">
                  <div className="flex rounded-full bg-[#f4f6f4] p-0.5 ring-1 ring-line/40">
                    {(["outline", "preview", "edit"] as Tab[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        title={t === "preview" ? "Actual file preview" : t === "edit" ? "Edit content cards" : "Edit plan"}
                        className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${tab === t ? "bg-ink text-white" : "text-muted"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {stale && spec && !generating && (
                <div className="flex shrink-0 items-center justify-center gap-2 border-b border-line/40 bg-amber-50 px-3 py-1.5 text-xs font-medium text-ink">
                  <span>Outline changed — preview is out of date</span>
                  <button type="button" onClick={generate} className="btn-primary h-7 px-3 text-xs">
                    Regenerate
                  </button>
                </div>
              )}
              <div className="min-h-0 flex-1 relative">
                {spec ? (
                  tab === "outline" && outline && !generating ? (
                    <div className="scroll-thin h-full overflow-y-auto px-3 py-5 md:px-6">
                      <OutlineEditor outline={outline} onChange={setOutline} disabled={busy} />
                    </div>
                  ) : generating ? (
                    <EditablePreview spec={spec} onChange={handleSpecChange} busy={generating || previewBusy || busy} streaming={gen.status === "writing"} />
                  ) : tab === "edit" ? (
                    <EditablePreview spec={spec} onChange={handleSpecChange} busy={previewBusy || busy} streaming={false} />
                  ) : (
                  <>
                    <PdfPreview
                      data={preview?.data ?? null}
                      kind={spec.format === "pptx" ? "slides" : "pages"}
                      busy={previewBusy}
                      busyLabel="Rendering preview…"
                      emptyTitle="No preview yet"
                      emptyHint="Generate to write the content and render the document."
                    />
                    {gen.status === "error" && (!spec || spec.blocks.length === 0) && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
                        <button type="button" onClick={generate} className="pointer-events-auto btn-primary shadow-float">
                          Regenerate
                        </button>
                      </div>
                    )}
                    {gen.status === "error" && spec && spec.blocks.length > 0 && (
                      <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
                        <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-ink shadow-float ring-1 ring-line">
                          <AlertCircle size={14} className="text-danger" />
                          <span className="max-w-[260px] truncate">{gen.message}</span>
                          <button type="button" onClick={generate} className="btn-primary h-7 px-3 text-xs">
                            Regenerate
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                  )
                ) : outline && (gen.status === "idle" || gen.status === "error") ? (
                  <div className="scroll-thin h-full overflow-y-auto px-3 py-5 md:px-6">
                    <div className="mx-auto mb-3 flex w-full max-w-3xl items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted">Review the plan, then generate your document.</p>
                      <button type="button" onClick={generate} className="btn-primary h-8 px-4 text-xs">
                        Generate
                      </button>
                    </div>
                    <OutlineEditor outline={outline} onChange={setOutline} disabled={busy} />
                    {gen.status === "error" && (
                      <p className="mx-auto mt-3 w-full max-w-3xl text-center text-xs text-danger">{gen.message}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    {gen.status === "writing" ? (
                      <>
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 size={24} className="animate-spin text-muted" />
                          <p className="text-sm font-medium tracking-tight text-ink">Composing</p>
                          <p className="text-xs text-muted/70">{outline ? `${outline.sections.length} sections • cards composing` : "Synthesizing…"}</p>
                          <div className="mt-4 grid w-full max-w-2xl gap-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="h-24 rounded-2xl bg-white/60 ring-1 ring-line shimmer" />
                            ))}
                          </div>
                        </div>
                      </>
                    ) : gen.status === "error" ? (
                      <>
                        <AlertCircle size={24} className="text-danger" />
                        <p className="mt-2 text-sm text-danger">{gen.message}</p>
                        <button type="button" onClick={generate} className="btn-primary mt-4">
                          Regenerate
                        </button>
                      </>
                    ) : gen.status === "rendering" ? (
                      <>
                        <Loader2 size={24} className="animate-spin text-muted" />
                        <p className="mt-3 text-sm text-muted">Rendering preview…</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted">Preparing preview…</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Settings removed — all customization via chat clarify now */}
          </div>
        </div>
      )}

      {toast && <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-float animate-rise">{toast}</div>}
    </div>
  );
}
