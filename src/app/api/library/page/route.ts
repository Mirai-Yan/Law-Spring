import { currentUser, json } from "@/lib/http";
import { getDocument, getPage, listCards } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  const sp = new URL(req.url).searchParams;
  const docId = Number(sp.get("doc"));
  const doc = getDocument(u.id, docId);
  if (!doc) return json({ error: "找不到这份资料" }, 404);
  const page = Math.min(Math.max(1, Number(sp.get("page")) || 1), doc.pages);
  return json({ doc, page, text: getPage(u.id, docId, page) ?? "", cards: listCards(u.id, { docId }) });
}
