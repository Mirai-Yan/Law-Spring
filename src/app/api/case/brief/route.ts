import { briefCase, MAX_BRIEF_TURN_CHARS, MAX_BRIEF_TURNS, MAX_CASE_CHARS, presetCaseBrief } from "@/lib/ai/analyze";
import { guard, json } from "@/lib/ai/guard";
import { llmConfigured, type ChatTurn } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** 分析之前先与用户确认案情：每次请求是一轮整理 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; turns?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 10) return json({ error: "案情太短，请至少写一两句话" }, 400);
  if (text.length > MAX_CASE_CHARS) return json({ error: `案情不要超过 ${MAX_CASE_CHARS} 字` }, 400);
  const raw = Array.isArray(body.turns) ? body.turns : [];
  if (raw.length > MAX_BRIEF_TURNS) return json({ error: "对话轮数太多了，请直接确认或回到原文重新整理" }, 400);
  const turns: ChatTurn[] = raw
    .filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_BRIEF_TURN_CHARS) }));
  if (turns.length && turns[turns.length - 1].role !== "user") return json({ error: "最后一轮应当是你的回答" }, 400);
  const blocked = guard(req);
  if (blocked) {
    // 没有访问口令时，内置口语化示例的第一轮整理仍可查看预置结果
    const preset = presetCaseBrief(text, turns);
    return preset ? json(preset) : blocked;
  }
  try {
    return json(await briefCase(text, turns));
  } catch (e) {
    return json({ error: (e as Error).message, configured: llmConfigured() }, 503);
  }
}
