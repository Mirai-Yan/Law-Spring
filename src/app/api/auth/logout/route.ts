import { SESSION_COOKIE, destroySession } from "@/lib/auth";
import { clearSessionCookie, json, readCookie, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  destroySession(readCookie(req, SESSION_COOKIE));
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(req) });
}
