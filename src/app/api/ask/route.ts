import { analyzeAsk, MAX_ASK_CHARS } from "@/lib/ai/analyze";
import { guard, json } from "@/lib/ai/guard";
import { getIndex } from "@/lib/content";
import { llmConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = (await req.json().catch(() => ({}))) as { q?: unknown };
  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (q.length < 2) return json({ error: "问题太短" }, 400);
  if (q.length > MAX_ASK_CHARS) return json({ error: `问题不要超过 ${MAX_ASK_CHARS} 字` }, 400);
  try {
    const out = await analyzeAsk(getIndex(), q);
    return json(out);
  } catch (e) {
    return json({ error: (e as Error).message, configured: llmConfigured() }, 503);
  }
}
