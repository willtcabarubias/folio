"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bot, Check, Loader2, MessageSquare, Paperclip, ScanEye, Sparkles } from "lucide-react";
import { ApiError, askAgent, downloadBlob, expandOutline, expandOutlineStream, extractFile, renderFile, renderPreview, reportApiError, safeName, specToMarkdown } from "@/lib/client/api";
import { rasterizePdf } from "@/lib/client/pdf";
import type { AgentResponse, Attachment, ChatTurn, DocumentSpec, Format, Outline } from "@/lib/spec/types";
import { getProject, newId, saveProject, type Project } from "@/lib/store/projects";
import { ChatThread, type ThreadMessage } from "./ChatThread";
import { EditablePreview } from "./EditablePreview";
import { PdfPreview } from "./PdfPreview";
import { PromptBox } from "./PromptBox";
import { TopBar, type ExportKind, type SaveState, type ShareKind } from "./TopBar";
import type { GenState } from "./SettingsPanel";


type Pane = "chat" | "doc";
type Tab = "outline" | "preview";

function isGreetingTitle(t: string): boolean {
  const s = t.trim().toLowerCase();
  return /^(hi|hello|hey|yo|sup|howdy|greetings|good (morning|afternoon|evening))[\s!.,]*$/.test(s) || s.length <= 2;
}

function fingerprint(o: Outline): string {
  return JSON.stringify([o.format, o.title, o.subtitle, o.docType, o.audience, o.tone, o.language, o.pageSize, o.targetLength, o.sections.map((s) => [s.title, s.layout, s.points])]);
}

function compactResponse(r: AgentResponse | undefined, text: string): string {
  if (!r) return JSON.stringify({ kind: "reply", message: text });
  if (r.kind === "outline") {
    const o = r.outline;
    return JSON.stringify({
      kind: "outline",
      message: r.message,
      outline: { title: o.title, subtitle: o.subtitle, format: o.format, docType: o.docType, audience: o.audience, tone: o.tone, language: o.language, targetLength: o.targetLength, lengthSource: o.lengthSource, sections: o.sections },
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
  const [saveState, setSaveState] = useState<SaveState>("saved");
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
      attachments: allReadyAttachments.map(({ id: aid, name, size, kind, text, chars, pages }) => ({ id: aid, name, size, kind, text, chars, pages })),
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

  const addFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files).slice(0, 6)) {
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
    // Create skeleton spec so preview shows immediately and streams cards
    const skeleton: DocumentSpec = {
      title: target.title,
      subtitle: target.subtitle,
      docType: target.docType,
      purpose: target.purpose,
      audience: target.audience,
      tone: target.tone,
      language: target.language,
      theme: target.theme,
      pageSize: target.pageSize,
      targetLength: target.targetLength,
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
        attachments: allReadyAttachments.map((a) => ({ name: a.name, text: a.text })),
      })) {
        if (evt.type === "block") {
          setSpec((prev) => {
            const base = prev ?? skeleton;
            const blocks = [...base.blocks];
            // place block at its outline index to keep order
            const idx = typeof evt.index === "number" && evt.index >= 0 ? evt.index : blocks.length;
            // ensure array length
            while (blocks.length <= idx) blocks.push(undefined as unknown as typeof blocks[0]);
            blocks[idx] = evt.block as typeof blocks[0];
            const ordered = target.sections
              .map((s) => blocks.find((b) => b && b.id === s.id))
              .filter(Boolean) as typeof blocks;
            // if some blocks not yet arrived, show what we have in received order without gaps
            const visible = ordered.length ? ordered : blocks.filter(Boolean) as typeof blocks;
            return { ...base, blocks: visible } as DocumentSpec;
          });
        } else if (evt.type === "done") {
          finalSpec = evt.spec;
          warnings = evt.warnings;
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

  // (settings removed — no bounce needed)

  const generate = async () => {
    if (!outline) return;
    await doGenerate(outline);
  };

  // Handle spec edits from EditablePreview (inline edit / drag reorder)
  const handleSpecChange = useCallback((next: DocumentSpec) => {
    setSpec(next);
    // keep preview stale tracking: spec edits are source of truth, don't mark stale
    // but we update title sync if needed
  }, []);

  const runAgent = useCallback(
    async (list: ThreadMessage[], currentOutline: Outline | null, files: Attachment[], preferred: Format | "auto") => {
      setBusy(true);
      try {
        const response = await askAgent({
          messages: list.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.role === "assistant" ? compactResponse(m.response, m.text) : m.text })),
          attachments: files.filter((a) => a.status === "ready").map((a) => ({ name: a.name, text: a.text })),
          currentOutline,
          preferredFormat: preferred,
        });
        if (response.kind === "outline") {
          // Smart title sync: only auto-update title if user hasn't manually edited, or they asked to rename, or current title is greeting/empty
          const lastUserText = list.filter((m) => m.role === "user").slice(-1)[0]?.text ?? "";
          const userAskedTitleChange = /title|rename|headline|call it|name it/i.test(lastUserText);
          setOutlineState(response.outline);
          setTitle((t) => {
            const cur = t.trim();
            if (!isUserEdited.current || !cur || isGreetingTitle(cur) || userAskedTitleChange) return response.outline.title;
            return t;
          });
          setPreferredFormat(response.outline.format);

          // After answers, directly create file and redirect to preview (no outline phase)
          const interimId = newId("m");
          const interimText = `${response.message} — Composing…`;
          const interimResponse: AgentResponse = { ...response, message: interimText } as AgentResponse;
          const interimMsg: ThreadMessage = { id: interimId, role: "assistant", text: interimText, response: interimResponse };
          setMessages((prev) => [...prev, interimMsg]);
          setPane("doc");
          setTab("preview");
          const updatedTranscript: ChatTurn[] = [
            ...list.filter((m) => !m.error).map((m) => ({ role: m.role as "user" | "assistant", content: m.role === "assistant" ? compactResponse(m.response, m.text) : m.text })),
            { role: "assistant" as const, content: response.message },
          ];
          if (generating || previewBusy) {
            autoGenPending.current = { outline: response.outline, transcript: updatedTranscript, interimId, response };
            showToast("Queued");
          } else {
            showToast("Composing");
            try {
              await doGenerate(response.outline, updatedTranscript);
              setMessages((prev) => prev.map((m) => (m.id === interimId ? { id: interimId, role: "assistant", text: response.message, response } : m)));
            } catch {
              setMessages((prev) => prev.map((m) => (m.id === interimId ? { id: interimId, role: "assistant", text: `${response.message} — generation failed, please retry`, response } : m)));
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
    [spec, generating, previewBusy, doGenerate],
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
    return { ...spec, title: effectiveTitle, pageSize: outline?.pageSize ?? spec.pageSize };
  };

  const exportAs = async (kind: ExportKind) => {
    if (generating || previewBusy) {
      showToast("File is still updating — please wait a moment");
      return;
    }
    const s = currentSpec();
    if (!s || exporting) return;
    setExporting(kind);
    try {
      if (kind === "md") {
        downloadBlob(new Blob([specToMarkdown(s)], { type: "text/markdown;charset=utf-8" }), `${safeName(s.title)}.md`);
      } else if (kind === "png") {
        const data = preview && preview.format === s.format ? preview.data : await renderPreview(s, s.format);
        const pages = await rasterizePdf(data, { width: s.format === "pptx" ? 1920 : 1654, type: "image/png" });
        if (pages.length === 1) downloadBlob(pages[0].blob, `${safeName(s.title)}.png`);
        else {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();
          const label = s.format === "pptx" ? "slide" : "page";
          pages.forEach((p, i) => zip.file(`${label}-${String(i + 1).padStart(2, "0")}.png`, p.blob));
          downloadBlob(await zip.generateAsync({ type: "blob" }), `${safeName(s.title)}-images.zip`);
        }
      } else {
        const { blob, fileName } = await renderFile(s, kind);
        downloadBlob(blob, fileName);
      }
      showToast("Export ready");
    } catch (err) {
      reportApiError(err, "Export failed", kind === "png" ? "client:preview" : "api:render");
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
      } else if (kind === "text") {
        const s = currentSpec();
        const text = s ? specToMarkdown(s) : outline ? `# ${outline.title}\n\n${outline.sections.map((x, i) => `${i + 1}. ${x.title}\n${x.points.map((p) => `   - ${p}`).join("\n")}`).join("\n")}` : "";
        await navigator.clipboard.writeText(text);
        showToast("Copied as text");
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
        centerLabel={planning ? undefined : hasGenerated ? "Preview" : "Outline"}
        onTitleChange={(v) => {
          isUserEdited.current = true;
          setTitle(v);
        }}
        saveState={saveState}
        onSave={() => {
          save();
          showToast("Saved to library");
        }}
        canExport={Boolean(spec)}
        exporting={exporting}
        onExport={exportAs}
        onShare={share}
        canShareFile={Boolean(spec)}
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="scroll-thin flex-1 overflow-y-auto px-4 md:px-6">
            <div className="mx-auto w-full max-w-3xl py-6 md:py-5">
              <ChatThread messages={messages} busy={busy} onAnswer={onAnswer} onSkip={onSkip} onRetry={retry} />
            </div>
          </div>
          <div className={`px-4 pb-5 pt-2 md:px-6 md:pb-4 ${hasPendingClarify ? "hidden" : ""}`}>
            <div className="mx-auto w-full max-w-3xl">
              <PromptBox value={input} onChange={setInput} onSubmit={() => send(input)} onFiles={addFiles} attachments={attachments} onRemoveAttachment={(fid) => setAttachments((p) => p.filter((a) => a.id !== fid))} busy={busy || attachments.some((a) => a.status === "extracting")} placeholder={attachments.some((a) => a.status === "extracting") ? "Extracting file… please wait" : "Reply or add details"} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Pane switcher (small screens) — chat/doc only, no settings */}
          <div className="flex items-center justify-center border-b border-line/40 bg-white px-3 py-2 lg:hidden">
            <div className="flex rounded-full bg-[#f4f6f4] p-0.5 ring-1 ring-line/40">
              {(
                [
                  { id: "chat", label: "Chat", icon: MessageSquare },
                  { id: "doc", label: "Document", icon: ScanEye },
                ] as { id: Pane; label: string; icon: typeof MessageSquare }[]
              ).map(({ id: pid, label, icon: Icon }) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setPane(pid)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition md:px-2.5 md:py-1 md:text-[11px] ${pane === pid ? "bg-ink text-white" : "text-muted"}`}
                >
                  <Icon size={13} className="md:h-3 md:w-3" />
                  {label}
                </button>
              ))}
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
              <div className={`px-3 pb-3 pt-1 md:px-2.5 md:pb-2.5 ${hasPreviewPendingClarify ? "hidden" : ""}`}>
                <PromptBox value={input} onChange={setInput} onSubmit={() => send(input)} onFiles={addFiles} attachments={attachments} onRemoveAttachment={(fid) => setAttachments((p) => p.filter((a) => a.id !== fid))} busy={busy || generating || attachments.some((a) => a.status === "extracting")} placeholder={attachments.some((a) => a.status === "extracting") ? "Extracting file… please wait" : generating ? "File is updating — please wait" : "Ask for changes"} />
              </div>
            </aside>

            {/* Document */}
            <section className={`${pane === "doc" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col bg-shell lg:flex`}>
              <div className="min-h-0 flex-1 relative">
                {spec ? (
                  <>
                    <EditablePreview spec={spec} onChange={handleSpecChange} busy={generating || previewBusy || busy} streaming={gen.status === "writing"} />
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
