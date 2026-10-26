import { guard, json } from "@/lib/ai/guard";
import { askTutorAI, MAX_TUTOR_CHARS, MAX_TUTOR_TURNS, parseTutorPage } from "@/lib/ai/tutor";
import { getIndex } from "@/lib/content";
import { llmConfigured, type ChatTurn } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = (await req.json().catch(() => ({}))) as { messages?: unknown; page?: unknown };
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatTurn[] = raw
    .filter((m): m is ChatTurn => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_TUTOR_CHARS) }))
    .filter((m) => m.content)
    .slice(-MAX_TUTOR_TURNS);
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "请先输入问题" }, 400);
  if (!llmConfigured()) return json({ error: "未配置大模型，暂时无法使用 AI 助教", configured: false }, 503);
  try {
    return json(await askTutorAI(getIndex(), messages, parseTutorPage(body.page)));
  } catch (e) {
    return json({ error: (e as Error).message, configured: true }, 503);
  }
}
