"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BookOpen, FileText, GraduationCap, LayoutPanelTop, NotebookPen, ClipboardCheck } from "lucide-react";
import { extractFile } from "@/lib/client/api";
import type { Attachment, Format } from "@/lib/spec/types";
import { listProjects, newId, saveProject, type Project } from "@/lib/store/projects";
import { PromptBox } from "@/components/studio/PromptBox";
import Strands from "@/components/Strands";


const QUICK_STARTS = [
  { icon: GraduationCap, label: "Lesson", prompt: "Create a lesson plan for " },
  { icon: BookOpen, label: "Study guide", prompt: "Make a study guide covering " },
  { icon: LayoutPanelTop, label: "Report slides", prompt: "Create report slides from this module: " },
  { icon: NotebookPen, label: "Summarize", prompt: "Summarize this module into key concepts: " },
  { icon: ClipboardCheck, label: "Quiz", prompt: "Create a 20-question quiz (MCQ, True/False, Identification) from " },
  { icon: FileText, label: "Handout", prompt: "Make a 1-page handout for " },
];

export function HomeView() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preferredFormat, setPreferredFormat] = useState<Format | "auto">("auto");
  const [recent, setRecent] = useState<Project[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setRecent(listProjects().slice(0, 3));
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

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 6);
    for (const file of list) {
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
      attachments: ready.map(({ id: aid, name, size, kind, text: t, chars, pages }) => ({ id: aid, name, size, kind, text: t, chars, pages })),
    };
    saveProject(project);
    router.push(`/studio/${id}`);
  };

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto overscroll-contain bg-shell">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 pt-6 pb-3 md:gap-2.5 md:px-8 md:pt-6 md:pb-3 min-h-[calc(100dvh-3.5rem)] min-h-[calc(100svh-3.5rem)]">
        <div className="flex shrink-0 flex-col items-center text-center">
          <h1 className="overflow-visible pr-1 text-center text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-ink md:pr-1.5 md:text-[34px] lg:text-[40px]">
            Study smarter. <span className="inline-block bg-gradient-to-b from-[#4da5fc] via-[#4da5fc] to-ink bg-clip-text pb-[0.02em] pr-[0.08em] text-transparent italic">Present faster.</span>
          </h1>
          <p className="mx-auto mt-2.5 max-w-xl text-center text-[15px] font-semibold leading-relaxed text-ink/70 md:mt-2 md:text-[14px]">
            Turn any module into a ready deck and quiz.
          </p>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center bg-transparent py-2 md:py-3 min-h-[180px]">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible bg-transparent select-none" aria-hidden="true">
            <div className="h-[300px] w-full max-w-[760px] max-h-[38dvh] translate-y-0 md:h-[380px] lg:h-[440px] md:max-h-[42dvh] md:translate-y-1 overflow-visible bg-transparent">
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

        <div className="flex shrink-0 flex-col items-center gap-1.5 md:gap-1">
          <div className="flex flex-wrap justify-center gap-1.5 md:gap-1">
            {QUICK_STARTS.slice(0, 2).map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => setInput(prompt)}
                className="btn-secondary h-7 w-[132px] justify-center gap-1 px-2.5 text-[11px] md:h-[26px] md:w-[124px] md:gap-1 md:px-2.5 md:text-[10px] md:leading-none"
              >
                <Icon size={12} className="shrink-0 text-ink md:h-[11px] md:w-[11px]" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 md:gap-1">
            {QUICK_STARTS.slice(2).map(({ icon: Icon, label, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => setInput(prompt)}
                className="btn-secondary h-7 w-[132px] justify-center gap-1 px-2.5 text-[11px] md:h-[26px] md:w-[124px] md:gap-1 md:px-2.5 md:text-[10px] md:leading-none"
              >
                <Icon size={12} className="shrink-0 text-ink md:h-[11px] md:w-[11px]" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full shrink-0 pt-1.5">
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

      {recent.length > 0 && (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pt-2 pb-10 md:px-8">
          <section className="pt-2">
            <div className="mb-3 flex items-center justify-between md:mb-2.5">
              <h3 className="text-sm font-semibold tracking-tight text-ink md:text-xs">Recent</h3>
              <Link href="/library" className="btn-secondary h-8 px-3 text-xs md:h-[27px] md:px-2.5 md:text-[11px]">
                View all
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 md:gap-2.5">
              {recent.map((p) => (
                <Link
                  key={p.id}
                  href={`/studio/${p.id}`}
                  className="card group flex flex-col gap-3 p-4 transition hover:shadow-float md:gap-2.5 md:p-[14px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="chip chip-neutral uppercase md:px-2 md:py-0.5 md:text-[10px]">{p.format}</span>
                    <span className={`chip md:px-2 md:py-0.5 md:text-[10px] ${p.status === "generated" ? "chip-brand" : "chip-neutral"}`}>
                      {p.status === "generated" ? "Generated" : p.status === "draft" ? "Outline" : "Planning"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-tight text-ink md:text-xs">{p.title}</p>
                    <p className="mt-0.5 text-xs text-muted md:text-[11px]">
                      {p.sectionCount ? `${p.sectionCount} ${p.format === "pptx" ? "slides" : "sections"}` : "In progress"}
                    </p>
                  </div>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-ink opacity-0 transition group-hover:opacity-100 md:text-[11px]">
                    Open <ArrowRight size={12} className="md:h-3 md:w-3" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
