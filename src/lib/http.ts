import "server-only";
import { SESSION_COOKIE, userFromToken, type User } from "./auth";

/** API 路由公用：JSON 响应、限流、同源检查、会话 cookie */

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

const buckets = new Map<string, number[]>();

/** 简单的内存限流：同一来源在窗口期内最多 max 次 */
export function rateLimited(req: Request, bucket: string, max: number, windowMs: number): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${bucket}:${ip}`;
  const t = Date.now();
  const list = (buckets.get(key) ?? []).filter((x) => t - x < windowMs);
  if (list.length >= max) return true;
  list.push(t);
  buckets.set(key, list);
  return false;
}

/** 修改数据的请求必须来自本站页面（防跨站请求伪造；会话 cookie 另设 SameSite=Lax） */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

export function currentUser(req: Request): User | null {
  return userFromToken(readCookie(req, SESSION_COOKIE));
}

function secure(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return proto === "https";
}

export function sessionCookie(req: Request, token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? "; Secure" : ""}`;
}

export function clearSessionCookie(req: Request): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(req) ? "; Secure" : ""}`;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
