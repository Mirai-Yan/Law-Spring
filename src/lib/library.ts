import "server-only";
import { getDb, now } from "./db";
import type { DocKind } from "./ingest/extract";

/** 个人资料库：每位用户只能看到自己的文档、页面与卡片 */

export type DocMeta = { id: number; title: string; filename: string; kind: DocKind; pages: number; chars: number; createdAt: number };
export type Passage = { docId: number; title: string; page: number; snippet: string; text?: string };
export type Card = { id: number; docId: number; title: string; page: number; quote: string; note: string | null; question: string | null; createdAt: number };

export const MAX_DOCS_PER_USER = 200;

export function addDocument(userId: number, title: string, filename: string, kind: DocKind, pages: string[]): number {
  const db = getDb();
  const chars = pages.reduce((n, p) => n + p.length, 0);
  return db.transaction(() => {
    const r = db
      .prepare("INSERT INTO documents (user_id, title, filename, kind, pages, chars, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, title, filename, kind, pages.length, chars, now());
    const id = Number(r.lastInsertRowid);
    const insPage = db.prepare("INSERT INTO doc_pages (doc_id, page, text) VALUES (?, ?, ?)");
    const insFts = db.prepare("INSERT INTO doc_fts (text, doc_id, page, user_id) VALUES (?, ?, ?, ?)");
    pages.forEach((t, i) => {
      insPage.run(id, i + 1, t);
      if (t) insFts.run(t, id, i + 1, userId);
    });
    return id;
  })();
}

export function countDocuments(userId: number): number {
  return (getDb().prepare("SELECT COUNT(*) n FROM documents WHERE user_id = ?").get(userId) as { n: number }).n;
}

export function listDocuments(userId: number): DocMeta[] {
  return getDb()
    .prepare("SELECT id, title, filename, kind, pages, chars, created_at AS createdAt FROM documents WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as DocMeta[];
}

export function getDocument(userId: number, docId: number): DocMeta | null {
  return (
    (getDb()
      .prepare("SELECT id, title, filename, kind, pages, chars, created_at AS createdAt FROM documents WHERE id = ? AND user_id = ?")
      .get(docId, userId) as DocMeta | undefined) ?? null
  );
}

export function getPage(userId: number, docId: number, page: number): string | null {
  const row = getDb()
    .prepare("SELECT p.text FROM doc_pages p JOIN documents d ON d.id = p.doc_id WHERE p.doc_id = ? AND p.page = ? AND d.user_id = ?")
    .get(docId, page, userId) as { text: string } | undefined;
  return row?.text ?? null;
}

export function deleteDocument(userId: number, docId: number): boolean {
  const db = getDb();
  return db.transaction(() => {
    const r = db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(docId, userId);
    if (r.changes) db.prepare("DELETE FROM doc_fts WHERE doc_id = ? AND user_id = ?").run(docId, userId);
    return r.changes > 0;
  })();
}

/** FTS5 trigram 的查询语法：每个词作为短语，至少 3 个字才能用索引 */
function ftsQuery(terms: string[]): string | null {
  const ok = terms.map((t) => t.replace(/"/g, "")).filter((t) => [...t].length >= 3);
  return ok.length ? ok.map((t) => `"${t}"`).join(" OR ") : null;
}

/** 提问的套话：去掉后剩下的才是要检索的内容 */
const ASK_FILLER = /我的资料|资料里|资料中|我的|怎么样|怎么|怎样|如何|为什么|什么|是否|有没有|哪些|讨论|谈到|提到|关于|问题|吗|呢|吧/g;
const MAX_TERMS = 24;

/**
 * 把一句话拆成可检索的词：按标点、空格和提问套话切开；
 * 4 个字以内的整体检索，更长的拆成三字片段（trigram 索引的最小单位），命中越多排名越前。
 */
export function searchTerms(q: string): string[] {
  const parts = q
    .replace(ASK_FILLER, " ")
    .split(/[\s，。、；：？！,.;:?!「」“”"'（）()《》]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const p of parts) {
    const cs = [...p];
    if (cs.length <= 4) out.add(p);
    else for (let i = 0; i + 3 <= cs.length; i++) out.add(cs.slice(i, i + 3).join(""));
  }
  const all = [...out];
  if (all.length <= MAX_TERMS) return all;
  // 太长的问题均匀取样，避免只检索前半句
  return Array.from({ length: MAX_TERMS }, (_, i) => all[Math.floor((i * all.length) / MAX_TERMS)]);
}

export function searchLibrary(userId: number, q: string, limit = 20, withText = false): Passage[] {
  const db = getDb();
  const terms = searchTerms(q);
  const fq = ftsQuery(terms);
  let rows: { docId: number; title: string; page: number; snippet: string; text?: string }[] = [];
  if (fq) {
    rows = db
      .prepare(
        `SELECT f.doc_id AS docId, d.title, f.page, snippet(doc_fts, 0, '«', '»', '…', 64) AS snippet${withText ? ", f.text" : ""}
         FROM doc_fts f JOIN documents d ON d.id = f.doc_id
         WHERE doc_fts MATCH ? AND f.user_id = ? ORDER BY rank LIMIT ?`,
      )
      .all(fq, userId, limit) as typeof rows;
  }
  // 两个字的词用不了 trigram 索引，退回 LIKE；单字太泛，只有整句就是一个字时才查
  const short = terms.filter((t) => [...t].length === 2 || (terms.length === 1 && [...t].length === 1));
  if (rows.length < limit && short.length) {
    const like = db.prepare(
      `SELECT p.doc_id AS docId, d.title, p.page, substr(p.text, max(1, instr(p.text, ?) - 30), 80) AS snippet${withText ? ", p.text" : ""}
       FROM doc_pages p JOIN documents d ON d.id = p.doc_id
       WHERE d.user_id = ? AND p.text LIKE ? LIMIT ?`,
    );
    for (const t of short) {
      for (const r of like.all(t, userId, `%${t}%`, limit) as typeof rows) {
        if (!rows.some((x) => x.docId === r.docId && x.page === r.page)) rows.push({ ...r, snippet: r.snippet.replaceAll(t, `«${t}»`) });
      }
    }
  }
  return rows.slice(0, limit);
}

/* ---------------- 我的卡片 ---------------- */

const CARD_SELECT = `SELECT c.id, c.doc_id AS docId, d.title, c.page, c.quote, c.note, c.question, c.created_at AS createdAt
  FROM cards c JOIN documents d ON d.id = c.doc_id`;

export function addCard(userId: number, docId: number, page: number, quote: string, note: string | null, question: string | null): number | null {
  const doc = getDocument(userId, docId);
  if (!doc || page < 1 || page > doc.pages) return null;
  const t = now();
  const r = getDb()
    .prepare("INSERT INTO cards (user_id, doc_id, page, quote, note, question, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(userId, docId, page, quote, note, question, t, t);
  return Number(r.lastInsertRowid);
}

export function listCards(userId: number, opts: { docId?: number; question?: string } = {}): Card[] {
  const where = ["c.user_id = ?"];
  const args: unknown[] = [userId];
  if (opts.docId != null) {
    where.push("c.doc_id = ?");
    args.push(opts.docId);
  }
  if (opts.question) {
    where.push("c.question = ?");
    args.push(opts.question);
  }
  return getDb().prepare(`${CARD_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.created_at DESC LIMIT 500`).all(...args) as Card[];
}

export function updateCard(userId: number, id: number, note: string | null, question: string | null): boolean {
  return getDb().prepare("UPDATE cards SET note = ?, question = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(note, question, now(), id, userId).changes > 0;
}

export function deleteCard(userId: number, id: number): boolean {
  return getDb().prepare("DELETE FROM cards WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}
