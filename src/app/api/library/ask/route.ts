import { askLibrary } from "@/lib/ai/library";
import { currentUser, json, rateLimited, readJson, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  if (rateLimited(req, "lib-ask", 30, 10 * 60_000)) return json({ error: "提问过于频繁，请稍后再试" }, 429);
  const { q } = await readJson(req);
  if (typeof q !== "string" || q.trim().length < 2 || q.length > 200) return json({ error: "问题请控制在 2—200 字" }, 400);
  try {
    return json(await askLibrary(u.id, q.trim()));
  } catch (e) {
    return json({ error: `大模型暂时不可用：${(e as Error).message}` }, 502);
  }
}
