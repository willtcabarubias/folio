import { NextResponse } from "next/server";
import { MAX_FILE_BYTES, extractText } from "@/lib/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is larger than 15 MB" }, { status: 413 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractText(buffer, file.name, file.type || "");
    return NextResponse.json({
      name: file.name,
      size: file.size,
      kind: result.kind,
      pages: result.pages,
      chars: result.text.length,
      text: result.text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read this file";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[extract]", message, stack);
    return NextResponse.json({ error: message, details: stack?.slice(0, 3000), stack: stack?.slice(0, 4000) }, { status: 422 });
  }
}
