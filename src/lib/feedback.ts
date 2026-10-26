import "server-only";
import { getDb, now } from "./db";

/** 建议与纠错：可以不登录提交；登录用户能看到自己的反馈与回复；开发者账号可以处理 */

export const FEEDBACK_KINDS = { suggestion: "建议", error: "内容纠错", bug: "功能问题" } as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;
export const FEEDBACK_STATUS = { new: "新提交", accepted: "已采纳", fixed: "已修复", declined: "不采纳" } as const;
export type FeedbackStatus = keyof typeof FEEDBACK_STATUS;

export type Feedback = {
  id: number;
  kind: FeedbackKind;
  target: string | null;
  page: string | null;
  body: string;
  contact: string | null;
  status: FeedbackStatus;
  reply: string | null;
  createdAt: number;
  updatedAt: number;
  username: string | null;
};

export function validateFeedback(b: Record<string, unknown>): string | null {
  if (!(typeof b.kind === "string" && b.kind in FEEDBACK_KINDS)) return "请选择反馈类型";
  if (typeof b.body !== "string" || b.body.trim().length < 5) return "请至少写 5 个字";
  if (b.body.length > 2000) return "内容请控制在 2000 字以内";
  for (const k of ["target", "page", "contact"] as const)
    if (b[k] != null && (typeof b[k] !== "string" || (b[k] as string).length > 300)) return "附加信息格式不正确";
  return null;
}

export function addFeedback(userId: number | null, b: Record<string, unknown>): number {
  const t = now();
  const r = getDb()
    .prepare("INSERT INTO feedback (user_id, kind, target, page, body, contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(userId, b.kind, (b.target as string) || null, (b.page as string) || null, (b.body as string).trim(), (b.contact as string)?.trim() || null, t, t);
  return Number(r.lastInsertRowid);
}

const SELECT = `SELECT f.id, f.kind, f.target, f.page, f.body, f.contact, f.status, f.reply, f.created_at AS createdAt, f.updated_at AS updatedAt, u.username
  FROM feedback f LEFT JOIN users u ON u.id = f.user_id`;

export function listFeedback(opts: { userId?: number; status?: string } = {}): Feedback[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.userId != null) {
    where.push("f.user_id = ?");
    args.push(opts.userId);
  }
  if (opts.status && opts.status in FEEDBACK_STATUS) {
    where.push("f.status = ?");
    args.push(opts.status);
  }
  return getDb()
    .prepare(`${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY f.created_at DESC LIMIT 500`)
    .all(...args) as Feedback[];
}

export function updateFeedback(id: number, status: FeedbackStatus, reply: string | null): boolean {
  const r = getDb().prepare("UPDATE feedback SET status = ?, reply = ?, updated_at = ? WHERE id = ?").run(status, reply?.trim() || null, now(), id);
  return r.changes > 0;
}
