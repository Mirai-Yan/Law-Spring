import { currentUser, json, rateLimited } from "@/lib/http";
import { searchLibrary } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  if (rateLimited(req, "lib-search", 120, 10 * 60_000)) return json({ error: "请求过于频繁" }, 429);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  return json({ results: q ? searchLibrary(u.id, q, 30) : [] });
}
