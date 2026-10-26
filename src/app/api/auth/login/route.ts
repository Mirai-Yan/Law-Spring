import { createSession, verifyUser } from "@/lib/auth";
import { json, rateLimited, readJson, sameOrigin, sessionCookie } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  if (rateLimited(req, "login", 20, 15 * 60_000)) return json({ error: "尝试次数过多，请 15 分钟后再试" }, 429);
  const { username, password } = await readJson(req);
  if (typeof username !== "string" || typeof password !== "string") return json({ error: "请输入用户名和密码" }, 400);
  const u = verifyUser(username, password);
  if (!u) return json({ error: "用户名或密码不正确" }, 401);
  const s = createSession(u.id);
  return json({ user: u }, 200, { "Set-Cookie": sessionCookie(req, s.token, s.maxAge) });
}
