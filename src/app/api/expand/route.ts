import { NextResponse } from "next/server";
import { AIError, MISSING_KEY_MESSAGE, generateStructured, isConfigured, type ChatMessage } from "@/lib/ai/client";
import { attachmentsToPromptText, expandSystemPrompt, outlineToPromptText } from "@/lib/ai/prompts";
import { fitToPages } from "@/lib/render/fit";
import { blockFromOutlineSection, designPass, normalizeBlock, normalizeOutline } from "@/lib/spec/normalize";
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
  const attachments = (body.attachments ?? []).filter((a) => a && a.text?.trim()).slice(0, 8);
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
          let spec = designPass(outline, allBlocks, outline.format);
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
    const blocks = results.flat();
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
