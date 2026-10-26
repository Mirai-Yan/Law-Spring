import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * 用户数据库（SQLite）：账号、会话、同步数据、反馈、个人资料库。
 * 文件默认在 data/app.db（被 git 忽略）；可用 DATA_DIR 环境变量改到别处。
 * 公共知识库仍在 content/ 的 YAML 里，与这里无关。
 */

const MIGRATIONS: string[] = [
  // 1：账号、会话、同步
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE user_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  `,
  // 2：建议与纠错
  `
  CREATE TABLE feedback (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    target TEXT,
    page TEXT,
    body TEXT NOT NULL,
    contact TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    reply TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX feedback_status ON feedback(status, created_at);
  CREATE INDEX feedback_user ON feedback(user_id);
  `,
  // 3：个人资料库
  `
  CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    kind TEXT NOT NULL,
    pages INTEGER NOT NULL,
    chars INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX documents_user ON documents(user_id);
  CREATE TABLE doc_pages (
    doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (doc_id, page)
  );
  CREATE VIRTUAL TABLE doc_fts USING fts5(text, doc_id UNINDEXED, page UNINDEXED, user_id UNINDEXED, tokenize = 'trigram');
  CREATE TABLE cards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    quote TEXT NOT NULL,
    note TEXT,
    question TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX cards_user ON cards(user_id);
  CREATE INDEX cards_question ON cards(user_id, question);
  `,
];

let db: Database.Database | null = null;

export function dataDir() {
  return path.resolve(process.env.DATA_DIR ?? "data");
}

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(dataDir(), { recursive: true });
  db = new Database(path.join(dataDir(), "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** 测试用：在内存中打开一个新库 */
export function openMemoryDb(): Database.Database {
  const d = new Database(":memory:");
  d.pragma("foreign_keys = ON");
  migrate(d);
  return d;
}

export function useDb(d: Database.Database) {
  db = d;
}

function migrate(d: Database.Database) {
  const v = d.pragma("user_version", { simple: true }) as number;
  for (let i = v; i < MIGRATIONS.length; i++) {
    d.transaction(() => {
      d.exec(MIGRATIONS[i]);
      d.pragma(`user_version = ${i + 1}`);
    })();
  }
}

export const now = () => Date.now();
