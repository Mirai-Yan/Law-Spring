import { createSession, createUser, validateCredentials } from "@/lib/auth";
import { json, rateLimited, readJson, sameOrigin, sessionCookie } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  if (rateLimited(req, "register", 10, 60 * 60_000)) return json({ error: "注册过于频繁，请稍后再试" }, 429);
  const { username, password } = await readJson(req);
  const bad = validateCredentials(username, password);
  if (bad) return json({ error: bad }, 400);
  const u = createUser(String(username), String(password));
  if (u === "taken") return json({ error: "这个用户名已被使用" }, 409);
  const s = createSession(u.id);
  return json({ user: u }, 200, { "Set-Cookie": sessionCookie(req, s.token, s.maxAge) });
}
