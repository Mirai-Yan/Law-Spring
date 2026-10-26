import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ContentFileSchema, DB_KEYS, emptyDb, type Db } from "./schema";

export type LoadIssue = { file: string; message: string };

export type LoadResult = {
  db: Db;
  issues: LoadIssue[];
  /** entityKey → 相对文件路径，供审核台显示 */
  locations: Record<string, string>;
};

/** 给每条实体一个稳定键，供审核台和 validator 报错使用 */
export function entityKey(kind: (typeof DB_KEYS)[number], item: unknown): string {
  const o = item as Record<string, unknown>;
  switch (kind) {
    case "prerequisites":
      return `prerequisites:${o.question}<-${o.requires}`;
    case "positions":
      return `positions:${o.theory}@${o.question}`;
    case "scholarPositions":
      return `scholarPositions:${o.scholar}@${o.question}`;
    case "relations":
      return `relations:${o.from}-${o.type}-${o.to}`;
    case "scholarWiki":
      return `scholarWiki:${o.scholar}`;
    default:
      return `${kind}:${o.id}`;
  }
}

export function parseContentFiles(
  files: { path: string; text: string }[],
): LoadResult {
  const db = emptyDb();
  const issues: LoadIssue[] = [];
  const locations: Record<string, string> = {};

  for (const f of files) {
    let raw: unknown;
    try {
      raw = yaml.load(f.text);
    } catch (e) {
      issues.push({ file: f.path, message: `YAML 解析失败：${(e as Error).message}` });
      continue;
    }
    if (raw == null) continue;

    const parsed = ContentFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const iss of parsed.error.issues) {
        issues.push({ file: f.path, message: `${iss.path.join(".")}: ${iss.message}` });
      }
      continue;
    }

    for (const key of DB_KEYS) {
      const arr = parsed.data[key];
      if (!arr) continue;
      for (const item of arr) {
        (db[key] as unknown[]).push(item);
        locations[entityKey(key, item)] = f.path;
      }
    }
  }

  return { db, issues, locations };
}

/** 递归读取内容目录；以 `_` 开头的目录（如 `_inbox`）默认跳过 */
export function readContentDir(
  dir: string,
  opts: { includeUnderscored?: boolean } = {},
): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_") && !opts.includeUnderscored) continue;
        walk(full);
      } else if (/\.ya?ml$/.test(entry.name)) {
        out.push({ path: path.relative(path.dirname(dir), full), text: fs.readFileSync(full, "utf8") });
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function loadContent(dir: string): LoadResult {
  return parseContentFiles(readContentDir(dir));
}
