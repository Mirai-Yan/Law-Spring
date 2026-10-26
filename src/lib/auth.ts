import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb, now } from "./db";

/** 账号与会话：用户名 + 密码，httpOnly 会话 cookie；会话令牌在库里只存哈希 */

export const SESSION_COOKIE = "fm_session";
const SESSION_DAYS = 30;

export type User = { id: number; username: string; admin: boolean };

const USERNAME_RE = /^[\p{L}\p{N}_-]{2,20}$/u;

export function validateCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== "string" || !USERNAME_RE.test(username)) return "用户名需为 2—20 个字符，只能包含文字、数字、下划线和连字符";
  if (typeof password !== "string" || password.length < 8 || password.length > 128) return "密码长度需为 8—128 个字符";
  return null;
}

function isAdminName(username: string) {
  const list = (process.env.ADMIN_USERNAMES ?? "")
    .split(/[,，\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(username.toLowerCase());
}

let dummyHash: string | undefined;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function createUser(username: string, password: string): User | "taken" {
  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) return "taken";
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)").run(username, hash, now());
  return { id: Number(r.lastInsertRowid), username, admin: isAdminName(username) };
}

export function verifyUser(username: string, password: string): User | null {
  const row = getDb().prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  // 用户不存在时也做一次哈希比较，避免通过响应时间探测用户名
  dummyHash ??= bcrypt.hashSync("dummy-password", 10);
  const ok = bcrypt.compareSync(password, row?.password_hash ?? dummyHash);
  return row && ok ? { id: row.id, username: row.username, admin: isAdminName(row.username) } : null;
}

export function createSession(userId: number): { token: string; maxAge: number } {
  const token = randomBytes(32).toString("base64url");
  const t = now();
  const maxAge = SESSION_DAYS * 24 * 3600;
  getDb()
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(token), userId, t, t + maxAge * 1000);
  return { token, maxAge };
}

export function userFromToken(token: string | undefined): User | null {
  if (!token) return null;
  const row = getDb()
    .prepare("SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?")
    .get(hashToken(token)) as { id: number; username: string; expires_at: number } | undefined;
  if (!row || row.expires_at < now()) return null;
  return { id: row.id, username: row.username, admin: isAdminName(row.username) };
}

export function destroySession(token: string | undefined) {
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

/* ---------------- 同步：按 key 存一份 JSON，最后修改时间较新者胜 ---------------- */

export type SyncRecord = { value: unknown; updatedAt: number };

export const SYNC_KEYS = ["practice", "theme", "bookmarks"] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];

export function getState(userId: number): Record<string, SyncRecord> {
  const rows = getDb().prepare("SELECT key, value, updated_at FROM user_state WHERE user_id = ?").all(userId) as {
    key: string;
    value: string;
    updated_at: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, { value: JSON.parse(r.value), updatedAt: r.updated_at }]));
}

/** 写入一条同步数据；只有比服务器上的更新时才覆盖。返回最终保存的版本 */
export function putState(userId: number, key: SyncKey, value: unknown, updatedAt: number): SyncRecord {
  const db = getDb();
  const cur = db.prepare("SELECT value, updated_at FROM user_state WHERE user_id = ? AND key = ?").get(userId, key) as
    | { value: string; updated_at: number }
    | undefined;
  if (cur && cur.updated_at >= updatedAt) return { value: JSON.parse(cur.value), updatedAt: cur.updated_at };
  const json = JSON.stringify(value);
  if (json.length > 200_000) throw new Error("数据过大");
  db.prepare(
    "INSERT INTO user_state (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(userId, key, json, updatedAt);
  return { value, updatedAt };
}
