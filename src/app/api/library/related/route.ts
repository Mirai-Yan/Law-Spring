import { suggestQuestions } from "@/lib/ai/library";
import { getIndex } from "@/lib/content";
import { currentUser, json, rateLimited, readJson, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 为一段资料推荐相关的库内问题；问题 id 全部对照知识库校验 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  if (rateLimited(req, "lib-related", 60, 10 * 60_000)) return json({ error: "请求过于频繁" }, 429);
  const { text } = await readJson(req);
  if (typeof text !== "string" || text.trim().length < 10) return json({ error: "段落太短" }, 400);
  const ix = getIndex();
  const { ids, via } = await suggestQuestions(ix, text);
  return json({ via, questions: ids.map((id) => ({ id, text: ix.question.get(id)!.text })) });
}
