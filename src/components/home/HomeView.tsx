"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, FileText, GraduationCap, LayoutPanelTop, NotebookPen, ClipboardCheck } from "lucide-react";
import { extractFile } from "@/lib/client/api";
import type { Attachment, Format } from "@/lib/spec/types";
import { newId, saveProject, type Project } from "@/lib/store/projects";
import { PromptBox } from "@/components/studio/PromptBox";
import Strands from "@/components/Strands";


const QUICK_STARTS: { icon: typeof GraduationCap; label: string; prompt: string; format: Format }[] = [
  { icon: GraduationCap, label: "Lesson", prompt: "Create a lesson plan for ", format: "docx" },
  { icon: BookOpen, label: "Study guide", prompt: "Make a study guide covering ", format: "pdf" },
  { icon: LayoutPanelTop, label: "Report slides", prompt: "Create report slides from this module: ", format: "pptx" },
  { icon: NotebookPen, label: "Summarize", prompt: "Summarize this module into key concepts: ", format: "pdf" },
  { icon: ClipboardCheck, label: "Quiz", prompt: "Create a 20-question quiz (MCQ, True/False, Identification) from ", format: "docx" },
  { icon: FileText, label: "Handout", prompt: "Make a 1-page handout for ", format: "pdf" },
];

export function HomeView() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preferredFormat, setPreferredFormat] = useState<Format | "auto">("auto");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pre = params.get("prompt");
      if (pre) {
        setInput(pre);
        const url = new URL(window.location.href);
        url.searchParams.delete("prompt");
        window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : "") + url.hash);
      }
    } catch {}
  }, []);

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("Failed to read file"));
      r.readAsDataURL(file);
    });

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 6);
    for (const file of list) {
      // Image branch — client-side vision (no /api/extract), 4 MB cap like notes/accomplishments
      if (file.type.startsWith("image/")) {
        if (file.size > 4 * 1024 * 1024) {
          const id = newId("f");
          setAttachments((prev) => [...prev, { id, name: file.name, size: file.size, kind: "image", text: "", chars: 0, status: "error" as const, error: "Image too large (max 4 MB)" }]);
          continue;
        }
        const id = newId("f");
        setAttachments((prev) => [...prev, { id, name: file.name, size: file.size, kind: "image", text: "", chars: 0, status: "extracting" as const }]);
        try {
          const dataUrl = await fileToDataUrl(file);
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "ready" as const, dataUrl, mimeType: file.type, isImage: true } : a)));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not read image";
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "error" as const, error: message } : a)));
        }
        continue;
      }
      const id = newId("f");
      setAttachments((prev) => [...prev, { id, name: file.name, size: file.size, kind: "", text: "", chars: 0, status: "extracting" }]);
      try {
        const result = await extractFile(file);
        setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...result, status: "ready" } : a)));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read this file";
        setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "error", error: message } : a)));
      }
    }
  }, []);

  const start = () => {
    const text = input.trim();
    const extracting = attachments.some((a) => a.status === "extracting");
    if (!text || starting || extracting) return;
    setStarting(true);
    const id = newId();
    const ready = attachments.filter((a) => a.status === "ready");
    const project: Project = {
      id,
      title: "",
      docType: "",
      format: preferredFormat === "auto" ? "pptx" : preferredFormat,
      status: "planning",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sectionCount: 0,
      sourceFiles: ready.map((a) => a.name),
      preferredFormat,
      messages: [{ id: newId("u"), role: "user", text, ...(ready.length ? { attachedNames: ready.map((a) => a.name) } : {}) }],
      attachments: ready.map(({ id: aid, name, size, kind, text: t, chars, pages, dataUrl, mimeType, isImage }) => ({ id: aid, name, size, kind, text: t, chars, pages, ...(dataUrl ? { dataUrl, mimeType, isImage } : {}) })),
    };
    saveProject(project);
    router.push(`/studio/${id}`);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-shell">
      <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-6 md:px-8 md:pt-6">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 md:gap-2.5">
          <div className="flex shrink-0 flex-col items-center text-center">
            <h1 className="overflow-visible pr-1 text-center text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-ink md:pr-1.5 md:text-[34px] lg:text-[40px]">
              Study smarter. <span className="inline-block bg-gradient-to-b from-[#4da5fc] via-[#4da5fc] to-ink bg-clip-text pb-[0.02em] pr-[0.08em] text-transparent italic">Present faster.</span>
            </h1>
            <p className="mx-auto mt-2.5 max-w-xl text-center text-[15px] font-semibold leading-relaxed text-ink/70 md:mt-2 md:text-[14px]">
              Turn any module into a ready deck and quiz.
            </p>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-transparent py-2 md:py-3">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible bg-transparent select-none" aria-hidden="true">
              <div className="h-[300px] w-full max-w-[760px] max-h-[36dvh] translate-y-0 md:h-[380px] lg:h-[440px] md:max-h-[42dvh] md:translate-y-1 overflow-hidden bg-transparent">
                <Strands
                  colors={["#F97316", "#7C3AED", "#06B6D4"]}
                  count={3}
                  speed={0.5}
                  amplitude={1}
                  waviness={1}
                  thickness={1}
                  glow={2.05}
                  taper={3}
                  spread={0.55}
                  intensity={0.55}
                  saturation={1}
                  opacity={1}
                  scale={1.7}
                  glass={false}
                  refraction={1}
                  dispersion={1}
                  glassSize={1}
                  hueShift={0.82}
                  style={{ width: "100%", height: "100%", background: "transparent" }}
                />
              </div>
            </div>
            <div className="h-[200px] max-h-[28dvh] md:h-[260px] w-full shrink-0 invisible" aria-hidden="true" />
          </div>

          {/* Quick starts — pyramid 1 · 2 · 3, longest (Report slides) at top */}
          <div className="flex w-full max-w-[360px] shrink-0 flex-col items-center gap-2 self-center md:max-w-[360px] md:gap-1">
            {(() => {
              const first = QUICK_STARTS[2];
              const rest = [QUICK_STARTS[0], QUICK_STARTS[1], QUICK_STARTS[3], QUICK_STARTS[4], QUICK_STARTS[5]];
              const Icon0 = first.icon;
              return (
                <>
                  <div className="flex w-full justify-center">
                    <button
                      key={first.label}
                      type="button"
                      onClick={() => {
                        setPreferredFormat(first.format);
                        setInput(first.prompt);
                      }}
                      className="btn-secondary h-8 max-w-[200px] flex-1 justify-center gap-1.5 px-4 text-[11px] md:h-[26px] md:max-w-[184px] md:gap-1 md:px-3 md:text-[10px] md:leading-none"
                    >
                      <Icon0 size={12} className="shrink-0 text-ink md:h-[11px] md:w-[11px]" />
                      <span className="truncate">{first.label}</span>
                    </button>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2 md:gap-1">
                    {rest.slice(0, 2).map(({ icon: Icon, label, prompt, format }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          setPreferredFormat(format);
                          setInput(prompt);
                        }}
                        className="btn-secondary h-8 w-full justify-center gap-1.5 px-3 text-[11px] md:h-[26px] md:gap-1 md:px-2.5 md:text-[10px] md:leading-none"
                      >
                        <Icon size={12} className="shrink-0 text-ink md:h-[11px] md:w-[11px]" />
                        <span className="min-w-0 truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid w-full grid-cols-3 gap-2 md:gap-1">
                    {rest.slice(2).map(({ icon: Icon, label, prompt, format }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          setPreferredFormat(format);
                          setInput(prompt);
                        }}
                        className="btn-secondary h-8 w-full justify-center gap-1 px-2 text-[11px] md:h-[26px] md:gap-1 md:px-2 md:text-[10px] md:leading-none"
                      >
                        <Icon size={12} className="shrink-0 text-ink md:h-[11px] md:w-[11px]" />
                        <span className="min-w-0 truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-line/30 bg-shell px-6 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:border-0 md:bg-transparent md:px-8 md:pb-3 md:pt-1.5">
        <div className="mx-auto w-full max-w-3xl">
          <PromptBox
            size="hero"
            value={input}
            onChange={setInput}
            onSubmit={start}
            onFiles={addFiles}
            attachments={attachments}
            onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
            busy={starting || attachments.some((a) => a.status === "extracting")}
            preferredFormat={preferredFormat}
            onPreferredFormat={setPreferredFormat}
            placeholder={
              attachments.some((a) => a.status === "extracting")
                ? "Extracting file… please wait"
                : "Paste your topic or drop your module PDF…"
            }
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
