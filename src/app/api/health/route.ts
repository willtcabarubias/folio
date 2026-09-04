import { isConfigured, modelName } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

export async function GET() {
  // The product runs without a database (projects live in the browser).
  // Report DB reachability as informational only.
  let db = false;
  try {
    const { db: client } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    await client.execute(sql`select 1`);
    db = true;
  } catch {
    db = false;
  }
  return Response.json({ ok: true, ai: isConfigured(), model: modelName(), db }, { headers: { "Cache-Control": "no-store" } });
}
