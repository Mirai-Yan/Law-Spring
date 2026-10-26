import { getIndex } from "@/lib/content";
import { currentUser, json, readJson, sameOrigin } from "@/lib/http";
import { addCard, deleteCard, listCards, updateCard } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function questionOrNull(v: unknown): string | null {
  return typeof v === "string" && getIndex().question.has(v) ? v : null;
}
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function GET(req: Request) {
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  const sp = new URL(req.url).searchParams;
  const doc = sp.get("doc");
  return json({ cards: listCards(u.id, { docId: doc ? Number(doc) : undefined, question: sp.get("question") ?? undefined }) });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  const b = await readJson(req);
  const quote = text(b.quote, 2000);
  if (!quote || typeof b.docId !== "number" || typeof b.page !== "number") return json({ error: "请先选中一段文字" }, 400);
  const id = addCard(u.id, b.docId, b.page, quote, text(b.note, 2000), questionOrNull(b.question));
  return id ? json({ id }) : json({ error: "找不到这份资料" }, 404);
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  const b = await readJson(req);
  if (typeof b.id !== "number") return json({ error: "参数不正确" }, 400);
  return updateCard(u.id, b.id, text(b.note, 2000), questionOrNull(b.question)) ? json({ ok: true }) : json({ error: "找不到这张卡片" }, 404);
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  return deleteCard(u.id, Number(new URL(req.url).searchParams.get("id"))) ? json({ ok: true }) : json({ error: "找不到这张卡片" }, 404);
}
