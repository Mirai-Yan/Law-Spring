import { currentUser, json, sameOrigin } from "@/lib/http";
import { deleteDocument, listDocuments } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  return json({ docs: listDocuments(u.id) });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  const id = Number(new URL(req.url).searchParams.get("id"));
  return deleteDocument(u.id, id) ? json({ ok: true }) : json({ error: "找不到这份资料" }, 404);
}
