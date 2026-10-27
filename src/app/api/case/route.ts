import { analyzeCase, MAX_CASE_CHARS, presetCaseResult } from "@/lib/ai/analyze";
import { guard, json } from "@/lib/ai/guard";
import { confirmedCaseText } from "@/lib/ai/schemas";
import { getIndex } from "@/lib/content";
import { llmConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; confirmed?: { restated?: unknown; facts?: unknown } };
  const c = body.confirmed;
  // 带上已确认的案情时，以确认结果作为分析的输入
  const confirmed =
    c && typeof c.restated === "string" && Array.isArray(c.facts)
      ? {
          restated: c.restated.slice(0, 600),
          facts: c.facts
            .filter((f): f is { text: string } => !!f && typeof (f as { text?: unknown }).text === "string")
            .slice(0, 16)
            .map((f) => ({ text: f.text.slice(0, 200) })),
        }
      : null;
  const text = confirmed ? confirmedCaseText(confirmed) : typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 10) return json({ error: "案情太短，请至少写一两句话" }, 400);
  if (text.length > (confirmed ? MAX_CASE_CHARS + 1200 : MAX_CASE_CHARS)) return json({ error: `案情不要超过 ${MAX_CASE_CHARS} 字` }, 400);
  const blocked = guard(req);
  if (blocked) {
    // 没有访问口令（或请求过多）时，内置示例仍可查看预置结果：不调用大模型，不花额度
    const preset = presetCaseResult(getIndex(), text);
    return preset ? json(preset) : blocked;
  }
  try {
    const out = await analyzeCase(getIndex(), text);
    return json(out);
  } catch (e) {
    return json({ error: (e as Error).message, configured: llmConfigured() }, 503);
  }
}
