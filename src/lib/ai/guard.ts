/** API 路由的公共防护：访问口令（公开部署时）、简单限流、统一的 JSON 响应 */

const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function accessCodeRequired(): boolean {
  return !!process.env.ACCESS_CODE;
}

/** 通过返回 null；否则返回应当直接发回的错误响应 */
export function guard(req: Request): Response | null {
  const code = process.env.ACCESS_CODE;
  if (code && req.headers.get("x-access-code") !== code)
    return json({ error: "需要访问口令", needCode: true }, 401);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return json({ error: "请求过于频繁，请稍后再试" }, 429);
  list.push(now);
  hits.set(ip, list);
  return null;
}
