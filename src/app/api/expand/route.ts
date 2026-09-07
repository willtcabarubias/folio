import { NextResponse } from "next/server";
import { AIError, MISSING_KEY_MESSAGE, generateStructured, isConfigured, type ChatMessage } from "@/lib/ai/client";
import { attachmentsToPromptText, expandSystemPrompt, outlineToPromptText } from "@/lib/ai/prompts";
import { headerToPromptText } from "@/lib/spec/intent";
import { fitToPages } from "@/lib/render/fit";
import { blockFromOutlineSection, designPass, normalizeBlock, normalizeOutline, pagePlan, specWordCount } from "@/lib/spec/normalize";
import { validateSpecForExport } from "@/lib/validate";
import { ExpandResponseSchema, OutlineSchema, type Block, type ExpandRequest, type Outline, type OutlineSection } from "@/lib/spec/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ATTACHMENT_BUDGET = 40_000;
const BATCH_SIZE_DECK = 6;
const BATCH_SIZE_DOC = 4;

export async function POST(req: Request) {
  const wantsStream = req.headers.get("accept")?.includes("text/event-stream") || new URL(req.url).searchParams.get("stream") === "1";
  let body: ExpandRequest;
  try {
    body = (await req.json()) as ExpandRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!isConfigured()) return NextResponse.json({ error: MISSING_KEY_MESSAGE, code: "missing_key" }, { status: 500 });

  const parsed = OutlineSchema.safeParse(body.outline);
  if (!parsed.success) return NextResponse.json({ error: "Outline is invalid" }, { status: 400 });
  const outline: Outline = normalizeOutline(parsed.data);
  const attachments = (body.attachments ?? []).filter((a) => a && ((a as any).isImage || a.text?.trim())).slice(0, 8);
  // Richer memory: last 16 user turns, 4000 chars each — custom requests survive truncation.
  const transcript = (body.transcript ?? []).filter((t) => t && typeof t.content === "string").slice(-16);

  // Design reference assist: resolve once, pass tokens to writer (never mandate restyle).
  let designRef: { ornament?: string; bulletStyle?: string; themeId?: string; mood?: string } | undefined;
  try {
    const { resolveDesign } = await import("@/lib/design/resolver");
    const r = resolveDesign({
      docType: outline.docType,
      tone: outline.tone,
      audience: outline.audience,
      targetPages: outline.format === "pptx" ? undefined : outline.targetLength,
      compact: outline.format !== "pptx",
      preferredTheme: outline.theme as never,
      format: outline.format,
    });
    const { getTheme } = await import("@/lib/spec/themes");
    const t = getTheme(r.themeId);
    designRef = { ornament: t.ornament, bulletStyle: t.bulletStyle, themeId: r.themeId, mood: r.mood };
  } catch {
    designRef = undefined;
  }
  const system = expandSystemPrompt(outline, designRef);
  const contextParts: string[] = [];
  const headerText = headerToPromptText(outline.header);
  if (headerText) contextParts.push(headerText);
  const brief = transcript
    .filter((t) => t.role === "user")
    .map((t) => t.content.slice(0, 4000))
    .join("\n---\n");
  if (brief) contextParts.push(`Original request and answers from the user:\n${brief}`);
  if (attachments.length) contextParts.push(`Source material (primary source of facts):\n${attachmentsToPromptText(attachments, ATTACHMENT_BUDGET)}`);
  const context = contextParts.join("\n\n");

  const batchSize = outline.format === "pptx" ? BATCH_SIZE_DECK : BATCH_SIZE_DOC;
  // Partial expand: only write the requested section ids (patch path). Client merges
  // into the existing spec, so skip designPass/fit/topUp here — just return raw blocks.
  const onlyIds = Array.isArray((body as { sectionIds?: unknown }).sectionIds)
    ? new Set(((body as { sectionIds?: unknown }).sectionIds as unknown[]).map((x) => String(x)))
    : null;
  const targetSections = onlyIds ? outline.sections.filter((s) => onlyIds.has(s.id)) : outline.sections;
  const effectiveSections = targetSections.length ? targetSections : outline.sections;
  const batches: OutlineSection[][] = [];
  for (let i = 0; i < effectiveSections.length; i += batchSize) batches.push(effectiveSections.slice(i, i + batchSize));

  if (wantsStream) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        const failures: string[] = [];
        try {
          send({ type: "start", total: outline.sections.length, outline: { title: outline.title, format: outline.format } });
          const allBlocks: Block[] = [];
          for (let idx = 0; idx < batches.length; idx++) {
            const sections = batches[idx];
            let batchBlocks: Block[];
            try {
              batchBlocks = await expandBatch(system, context, outline, sections);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              failures.push(`batch ${idx + 1}: ${msg}`);
              if (err instanceof AIError && (err.status === 500 || err.status === 429) && idx === 0) throw err;
              batchBlocks = sections.map((s) => blockFromOutlineSection(s, outline));
            }
            for (const b of batchBlocks) {
              allBlocks.push(b);
              const globalIndex = outline.sections.findIndex((s) => s.id === b.id);
              send({ type: "block", block: b, index: globalIndex >= 0 ? globalIndex : allBlocks.length - 1 });
              // stagger to create visible realtime writing
              await new Promise((r) => setTimeout(r, 180));
            }
          }
          if (failures.length === batches.length && batches.length > 0) {
            throw new AIError(`The writer could not produce content (${failures[0]})`, 502);
          }
          let finalBlocks = allBlocks;
          if (!failures.length && !onlyIds) {
            const top = await topUpIfShort(system, context, outline, allBlocks);
            finalBlocks = top.blocks;
            if (top.toppedUp) {
              for (const b of top.blocks.slice(allBlocks.length)) {
                send({ type: "block", block: b, index: allBlocks.length });
              }
              if (top.warning) failures.push(top.warning);
            }
          }
          if (onlyIds) {
            // Partial path: return raw blocks only — client merges into existing spec.
            send({ type: "done", spec: null, blocks: finalBlocks, partial: true, warnings: failures, fit: null });
          } else {
            let spec = designPass(outline, finalBlocks, outline.format);
            if (outline.format !== "pptx") spec = await fitToPages(spec);
            // Hybrid QA: deterministic validate-style checks appended as warnings (never block).
            try {
              failures.push(...validateSpecForExport(spec, outline).slice(0, 4));
            } catch {
              // QA must never break generation.
            }
            send({ type: "done", spec, warnings: failures, fit: spec.fit ?? null });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unexpected error";
          const stack = err instanceof Error ? err.stack : undefined;
          console.error("[expand-stream]", message, stack);
          send({ type: "error", error: message, details: stack?.slice(0, 3000) } as unknown);
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const failures: string[] = [];
  try {
    const results = await Promise.all(
      batches.map(async (sections, idx) => {
        try {
          return await expandBatch(system, context, outline, sections);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(`batch ${idx + 1}: ${msg}`);
          if (err instanceof AIError && (err.status === 500 || err.status === 429) && idx === 0) throw err;
          return sections.map((s) => blockFromOutlineSection(s, outline));
        }
      }),
    );
    if (failures.length === batches.length && batches.length > 0) {
      throw new AIError(`The writer could not produce content (${failures[0]})`, 502);
    }
    let blocks = results.flat();
    if (onlyIds) {
      // Partial path: no top-up/design/fit — client merges blocks into existing spec.
      return NextResponse.json({ blocks, partial: true, warnings: failures, fit: null });
    }
    if (!failures.length) {
      const top = await topUpIfShort(system, context, outline, blocks);
      blocks = top.blocks;
      if (top.toppedUp && top.warning) failures.push(top.warning);
    }
    let spec = designPass(outline, blocks, outline.format);
    if (outline.format !== "pptx") spec = await fitToPages(spec);
    try {
      failures.push(...validateSpecForExport(spec, outline).slice(0, 4));
    } catch {
      // QA must never break generation.
    }
    return NextResponse.json({ spec, warnings: failures, fit: spec.fit ?? null });
  } catch (err) {
    const status = err instanceof AIError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[expand]", message, stack);
    return NextResponse.json({ error: message, details: stack?.slice(0, 3000), stack: stack?.slice(0, 4000) }, { status });
  }
}

/**
 * Document types where filler sections are never appropriate: sparse forms
 * (invoice/receipt), personal/official one-pagers, and assessments whose
 * structure is exact (questions + answer key). Top-up yields to an explicit
 * user length request even here.
 */
const NO_TOPUP_RE = /\b(invoice|receipt|cover letter|letter|resume|cv|quiz|worksheet|certificate|checklist|agenda|memo)\b/i;

/**
 * Expand-in-place (no forced takeaways): when the writer under-produces (<90% of the
 * word budget), deepen the thinnest existing content blocks instead of inventing
 * new "Key Details / Putting It Into Practice" sections. Never creates new titles —
 * user prompt + outline + source material are the only structure source.
 * Bounded: single call, max 2 blocks rewritten, skipped for decks, sparse forms,
 * and 12+ content sections. Returns warning when still short (ship short, don't fill).
 */
async function topUpIfShort(
  system: string,
  context: string,
  outline: Outline,
  blocks: Block[],
): Promise<{ blocks: Block[]; toppedUp: boolean; warning?: string }> {
  if (outline.format === "pptx") return { blocks, toppedUp: false };
  if (outline.lengthSource !== "user" && NO_TOPUP_RE.test(outline.docType)) return { blocks, toppedUp: false };
  const budget = pagePlan(outline).wordsTotal;
  if (!budget) return { blocks, toppedUp: false };
  const words = specWordCount({ blocks } as unknown as Parameters<typeof specWordCount>[0]);
  const contentCount = blocks.filter((b) => b.layout !== "cover" && b.layout !== "agenda").length;
  if (words >= budget * 0.9 || contentCount >= 12) return { blocks, toppedUp: false };
  const deficit = Math.max(60, Math.round(budget - words));
  // Pick the 1-2 thinnest content blocks (excluding cover/closing/quiz) to deepen.
  const candidates = blocks
    .filter((b) => b.layout !== "cover" && b.layout !== "closing" && b.layout !== "agenda" && b.layout !== "quiz")
    .sort((a, b) => {
      const wa = specWordCount({ blocks: [a] } as unknown as Parameters<typeof specWordCount>[0]);
      const wb = specWordCount({ blocks: [b] } as unknown as Parameters<typeof specWordCount>[0]);
      return wa - wb;
    })
    .slice(0, deficit > 400 ? 2 : 1);
  if (!candidates.length) {
    return { blocks, toppedUp: false, warning: `Document is ~${deficit} words short of budget — add detail to existing sections rather than new ones.` };
  }
  try {
    const brief = candidates
      .map((c) => `[id=${c.id}] [layout=${c.layout}] ${c.title}`)
      .join("\n");
    const result = await generateStructured({
      schema: ExpandResponseSchema,
      system,
      messages: [
        {
          role: "user",
          content: `${context ? `${context}\n\n---\n` : ""}Title: ${outline.title}\nLanguage: ${outline.language}\n\nThe document is about ${deficit} words short of its ${budget}-word budget. Do NOT create new sections, titles, takeaways, or "putting into practice" blocks. Instead, rewrite ONLY these existing blocks with deeper substance (concrete examples, mechanisms, numbers from source material where available), keeping the SAME id, title, and layout for each:\n${brief}\n\nReturn ONLY {"blocks":[...]} with exactly ${candidates.length} block(s), same ids/titles/layouts, expanded bodies/bullets to cover ~${deficit} more words total. Stay faithful to source material; do not repeat points across blocks.`,
        },
      ],
      maxTokens: 4000,
      temperature: 0.55,
      label: "Writer-expand-in-place",
    });
    const byId = new Map(blocks.map((b) => [b.id, b]));
    let replaced = 0;
    for (const raw of result.blocks.slice(0, 2)) {
      const id = String((raw as { id?: unknown }).id ?? "");
      if (!id || !byId.has(id)) continue; // strict: unknown ids rejected, never appended
      const prev = byId.get(id)!;
      const hint = outline.sections.find((s) => s.id === id);
      const next = normalizeBlock({ ...raw, id, title: prev.title, layout: prev.layout }, id, outline.format, hint);
      // Preserve structural intent: never flip a block into closing/quiz/takeup.
      if (next.layout === "closing" && prev.layout !== "closing") next.layout = prev.layout;
      byId.set(id, { ...next, id, title: prev.title });
      replaced++;
    }
    if (!replaced) return { blocks, toppedUp: false };
    const out = blocks.map((b) => byId.get(b.id) ?? b);
    return { blocks: out, toppedUp: true, warning: `Deepened ${replaced} existing section(s) (~${deficit} words). No new sections added.` };
  } catch {
    return { blocks, toppedUp: false };
  }
}

async function expandBatch(system: string, context: string, outline: Outline, sections: OutlineSection[]): Promise<Block[]> {
  const user = `${context ? `${context}\n\n---\n` : ""}${outlineToPromptText(outline, sections)}\n\nWrite these ${sections.length} block(s) now.`;
  const messages: ChatMessage[] = [{ role: "user", content: user }];
  const result = await generateStructured({
    schema: ExpandResponseSchema,
    system,
    messages,
    maxTokens: outline.format === "pptx" ? 7000 : 8000,
    temperature: 0.55,
    label: "Writer",
  });

  // Strict alignment: unknown ids are rejected (never appended as takeaways).
  // Falls back to outline content so structure always matches user request.
  const byId = new Map<string, (typeof result.blocks)[number]>();
  for (const b of result.blocks) if (b.id) byId.set(String(b.id), b);

  return sections.map((section) => {
    const raw = byId.get(section.id);
    if (!raw) return blockFromOutlineSection(section, outline);
    const block = normalizeBlock({ ...raw, id: section.id }, section.id, outline.format, section);
    // Cover/closing intent from the outline always wins.
    if (section.layout === "cover") block.layout = "cover";
    if (section.layout === "closing") block.layout = "closing";
    if (section.layout === "agenda") block.layout = "agenda";
    if (section.layout === "section") block.layout = "section";
    return block;
  });
}
