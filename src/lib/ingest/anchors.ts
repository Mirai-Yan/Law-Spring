/**
 * 原文锚点核对：知识库里据书整理的每条内容，都在本机私有文件 content/_private/anchors.yaml 里
 * 附一句原文（30 字以内）和印刷页码。这里检查锚点确实出现在所引页上，且页码落在条目声明的页码范围内。
 * 锚点只用于核对，不进网站。
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { Db } from "../schema";
import { anchorFound, parsePages } from "./text";

export type Anchor = { key: string; page: number; text: string };
export type AnchorProblem = { key: string; message: string };

export function readAnchors(file: string): Anchor[] {
  if (!fs.existsSync(file)) return [];
  const raw = yaml.load(fs.readFileSync(file, "utf8")) as { anchors?: Anchor[] } | null;
  return raw?.anchors ?? [];
}

export function readBookPages(file: string): Map<number, string> {
  const m = new Map<number, string>();
  if (!fs.existsSync(file)) return m;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const p = JSON.parse(line) as { page: number; text: string };
    m.set(p.page, p.text);
  }
  return m;
}

/** 条目 key 允许带后缀，如 bookViews:zmk7-q-ad-treatment#2 表示第 2 条转述 */
function declaredPages(db: Db, key: string): string | undefined {
  const [base, sub] = key.split("#");
  const i = base.indexOf(":");
  const kind = base.slice(0, i);
  const id = base.slice(i + 1);
  if (kind === "bookViews") {
    const bv = db.bookViews.find((b) => b.id === id);
    if (!bv) return undefined;
    return sub != null ? bv.reported[Number(sub)]?.pages : bv.pages;
  }
  if (kind === "crimes") return db.crimes.find((c) => c.id === id)?.sources.map((s) => s.pages).join(",");
  const coll = (db as unknown as Record<string, { id?: string; sources?: { pages?: string }[] }[]>)[kind];
  return coll?.find((x) => x.id === id)?.sources?.map((s) => s.pages ?? "").join(",");
}

export function checkAnchors(db: Db, anchors: Anchor[], pages: Map<number, string>): AnchorProblem[] {
  const out: AnchorProblem[] = [];
  // 每条教科书论述至少要有一条原文锚点（作者本人的结论或说明）
  const anchored = new Set(anchors.map((a) => a.key.split("#")[0]));
  for (const bv of db.bookViews) if (!anchored.has(`bookViews:${bv.id}`)) out.push({ key: `bookViews:${bv.id}`, message: "没有任何原文锚点" });
  for (const a of anchors) {
    const declared = declaredPages(db, a.key);
    if (declared === undefined) {
      out.push({ key: a.key, message: "知识库中找不到这个条目" });
      continue;
    }
    const ranges = declared
      .split(/[,，、]/)
      .map((s) => parsePages(s))
      .filter((r): r is { from: number; to: number } => !!r);
    if (ranges.length && !ranges.some((r) => a.page >= r.from && a.page <= r.to + 1))
      out.push({ key: a.key, message: `锚点页 ${a.page} 不在条目声明的页码「${declared}」之内` });
    if ([...a.text].length > 30) out.push({ key: a.key, message: `锚点超过 30 字：「${a.text}」` });
    const text = pages.get(a.page);
    if (text == null) out.push({ key: a.key, message: `书中没有第 ${a.page} 页` });
    else if (!anchorFound(a.text, text, pages.get(a.page + 1))) out.push({ key: a.key, message: `第 ${a.page} 页找不到锚点「${a.text}」` });
  }
  return out;
}

export const ANCHOR_FILE = path.join("content", "_private", "anchors.yaml");
export const BOOK_PAGES = path.join(".cache", "books", "zmk7", "pages.jsonl");
