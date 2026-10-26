import { getState, putState, SYNC_KEYS, type SyncKey } from "@/lib/auth";
import { currentUser, json, rateLimited, readJson, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 读取当前用户的全部同步数据 */
export async function GET(req: Request) {
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  return json({ state: getState(u.id) });
}

/** 写入一条同步数据：{ key, value, updatedAt }；服务器上的更新时保留服务器版本 */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  if (rateLimited(req, "sync", 240, 10 * 60_000)) return json({ error: "请求过于频繁" }, 429);
  const { key, value, updatedAt } = await readJson(req);
  if (!SYNC_KEYS.includes(key as SyncKey)) return json({ error: "不支持的同步项" }, 400);
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return json({ error: "缺少修改时间" }, 400);
  try {
    // 客户端时钟可能偏快，最多接受比服务器当前时间晚 1 分钟的时间戳
    const t = Math.min(updatedAt, Date.now() + 60_000);
    return json({ record: putState(u.id, key as SyncKey, value, t) });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}
