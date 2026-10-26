import { FEEDBACK_STATUS, listFeedback, updateFeedback, type FeedbackStatus } from "@/lib/feedback";
import { currentUser, json, readJson, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin(req: Request) {
  const u = currentUser(req);
  return u?.admin ? u : null;
}

export async function GET(req: Request) {
  if (!admin(req)) return json({ error: "只有开发者账号可以查看" }, 403);
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return json({ items: listFeedback({ status }) });
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  if (!admin(req)) return json({ error: "只有开发者账号可以处理" }, 403);
  const { id, status, reply } = await readJson(req);
  if (typeof id !== "number" || !(typeof status === "string" && status in FEEDBACK_STATUS)) return json({ error: "参数不正确" }, 400);
  if (reply != null && (typeof reply !== "string" || reply.length > 2000)) return json({ error: "回复过长" }, 400);
  return updateFeedback(id, status as FeedbackStatus, (reply as string) ?? null) ? json({ ok: true }) : json({ error: "找不到这条反馈" }, 404);
}
