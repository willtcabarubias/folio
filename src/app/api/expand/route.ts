import { NextResponse } from "next/server";
import { AIError, MISSING_KEY_MESSAGE, generateStructured, isConfigured, type ChatMessage } from "@/lib/ai/client";
import { attachmentsToPromptText, expandSystemPrompt, outlineToPromptText } from "@/lib/ai/prompts";
import { fitToPages } from "@/lib/render/fit";
import { blockFromOutlineSection, designPass, normalizeBlock, normalizeOutline, pagePlan, specWordCount } from "@/lib/spec/normalize";
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
  const transcript = (body.transcript ?? []).filter((t) => t && typeof t.content === "string").slice(-10);

  const system = expandSystemPrompt(outline);
  const contextParts: string[] = [];
  const brief = transcript
    .filter((t) => t.role === "user")
    .map((t) => t.content.slice(0, 2500))
    .join("\n---\n");
  if (brief) contextParts.push(`Original request and answers from the user:\n${brief}`);
  if (attachments.length) contextParts.push(`Source material (primary source of facts):\n${attachmentsToPromptText(attachments, ATTACHMENT_BUDGET)}`);
  const context = contextParts.join("\n\n");

  const batchSize = outline.format === "pptx" ? BATCH_SIZE_DECK : BATCH_SIZE_DOC;
  const batches: OutlineSection[][] = [];
  for (let i = 0; i < outline.sections.length; i += batchSize) batches.push(outline.sections.slice(i, i + batchSize));

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
          if (!failures.length) {
            const top = await topUpIfShort(system, context, outline, allBlocks);
            finalBlocks = top.blocks;
            if (top.toppedUp) {
              for (const b of top.blocks.slice(allBlocks.length)) {
                send({ type: "block", block: b, index: allBlocks.length });
              }
              if (top.warning) failures.push(top.warning);
            }
          }
          let spec = designPass(outline, finalBlocks, outline.format);
          if (outline.format !== "pptx") spec = await fitToPages(spec);
          send({ type: "done", spec, warnings: failures, fit: spec.fit ?? null });
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
    if (!failures.length) {
      const top = await topUpIfShort(system, context, outline, blocks);
      blocks = top.blocks;
      if (top.toppedUp && top.warning) failures.push(top.warning);
    }
    let spec = designPass(outline, blocks, outline.format);
    if (outline.format !== "pptx") spec = await fitToPages(spec);
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
 * Fill-priority top-up (ruling B): when the writer under-produces (<90% of the
 * word budget), add ONE "Key Details" batch before the closing instead of
 * shipping a document with a half-empty last page. Bounded: single call,
 * max 2 blocks, skipped for decks, sparse forms, and 12+ content sections.
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
  const titles = blocks.map((b) => b.title).filter(Boolean).join(" | ").slice(0, 600);
  const wantTwo = deficit > 400;
  try {
    const result = await generateStructured({
      schema: ExpandResponseSchema,
      system,
      messages: [
        {
          role: "user",
          content: `${context ? `${context}\n\n---\n` : ""}Title: ${outline.title}\nLanguage: ${outline.language}\nExisting sections (do NOT repeat these): ${titles}\n\nThe document is about ${deficit} words short of its ${budget}-word budget and the last page would be half empty. Write ${wantTwo ? "TWO" : "ONE"} additional substantive block(s) that add genuinely new detail for "${outline.title}" (concrete examples, implications, practical next steps for a student reader). First block: id "topup1", title "Key Details & Takeaways", layout "bullets" with 4-5 bullets of 12-18 words each.${wantTwo ? ' Second block: id "topup2", title "Putting It Into Practice", layout "paragraph" with one tight paragraph.' : ""} Together they must total ~${deficit} words. Return ONLY {"blocks":[...]}.`,
        },
      ],
      maxTokens: 4000,
      temperature: 0.55,
      label: "Writer-topup",
    });
    const fresh = result.blocks.slice(0, 2).map((raw, i) => {
      const id = `topup${i + 1}`;
      return normalizeBlock({ ...raw, id }, id, outline.format, undefined);
    });
    if (!fresh.length) return { blocks, toppedUp: false };
    const out = [...blocks];
    const closingIdx = out.findIndex((b) => b.layout === "closing");
    if (closingIdx >= 0) out.splice(closingIdx, 0, ...fresh);
    else out.push(...fresh);
    return { blocks: out, toppedUp: true, warning: `Added a Key Details section (${deficit} words) to fill the pages.` };
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

  // Align returned blocks to the requested sections by id, then by order.
  const byId = new Map<string, (typeof result.blocks)[number]>();
  for (const b of result.blocks) if (b.id) byId.set(String(b.id), b);
  const unused = result.blocks.filter((b) => !b.id || !sections.some((s) => s.id === String(b.id)));

  return sections.map((section) => {
    const raw = byId.get(section.id) ?? unused.shift();
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
