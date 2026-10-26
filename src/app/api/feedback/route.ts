import { addFeedback, listFeedback, validateFeedback } from "@/lib/feedback";
import { currentUser, json, rateLimited, readJson, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 提交反馈；不登录也可以 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  if (rateLimited(req, "feedback", 8, 10 * 60_000)) return json({ error: "提交过于频繁，请稍后再试" }, 429);
  const b = await readJson(req);
  const bad = validateFeedback(b);
  if (bad) return json({ error: bad }, 400);
  const u = currentUser(req);
  return json({ id: addFeedback(u?.id ?? null, b) });
}

/** 我的反馈（需要登录） */
export async function GET(req: Request) {
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  return json({ items: listFeedback({ userId: u.id }) });
}
