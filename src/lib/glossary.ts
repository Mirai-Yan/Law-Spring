/**
 * 基础词条的识别：在一段文字里找出词条（含别名），最长匹配优先；
 * wiki 链接 [[kind:id|文字]] 内部不识别。服务端、客户端都可用（纯函数）。
 */
import { WIKI_RE, type Index } from "./graph";
import type { Term } from "./schema";

/** 交给客户端浮层的精简词条 */
export type TermLite = Pick<Term, "id" | "term" | "short" | "definition" | "concept" | "status" | "original"> & {
  conceptName?: string;
};

export type TermMatcher = {
  /** 词条、别名与排除词组的并集，按长度降序 */
  re: RegExp | null;
  /** 匹配到的文字 → 词条；排除词组映射为 null（吃掉但不标注） */
  byText: Map<string, Term | null>;
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildTermMatcher(terms: Term[]): TermMatcher {
  const byText = new Map<string, Term | null>();
  for (const t of terms) for (const s of [t.term, ...t.aliases]) if (s && !byText.has(s)) byText.set(s, t);
  // 排除词组优先于其中包含的词条：「故意杀人罪」整体吃掉，不给「故意」加下划线
  for (const t of terms) for (const s of t.notIn) if (s && !byText.get(s)) byText.set(s, null);
  const keys = [...byText.keys()].sort((a, b) => b.length - a.length);
  return { re: keys.length ? new RegExp(keys.map(escape).join("|"), "g") : null, byText };
}

const matchers = new WeakMap<Index, TermMatcher>();

/** 每个索引只建一次 */
export function termMatcher(ix: Index): TermMatcher {
  let m = matchers.get(ix);
  if (!m) {
    m = buildTermMatcher(ix.db.terms);
    matchers.set(ix, m);
  }
  return m;
}

export type TermPiece = string | { term: Term; text: string };

/** 把一段纯文字（不含 wiki 链接）切成文字与词条 */
export function splitTerms(text: string, m: TermMatcher): TermPiece[] {
  if (!m.re || !text) return [text];
  const out: TermPiece[] = [];
  let last = 0;
  for (const hit of text.matchAll(m.re)) {
    const t = m.byText.get(hit[0]);
    if (!t) continue;
    const start = hit.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    out.push({ term: t, text: hit[0] });
    last = start + hit[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 一段文字（可含 wiki 链接）中出现的词条 id，按首次出现排序 */
export function termsIn(text: string | undefined, m: TermMatcher): string[] {
  if (!text) return [];
  const plain = text.replace(WIKI_RE, " ");
  const out: string[] = [];
  for (const p of splitTerms(plain, m)) if (typeof p !== "string" && !out.includes(p.term.id)) out.push(p.term.id);
  return out;
}

export function termLite(ix: Index, t: Term): TermLite {
  return {
    id: t.id,
    term: t.term,
    short: t.short,
    definition: t.definition,
    concept: t.concept,
    status: t.status,
    original: t.original,
    conceptName: t.concept ? ix.concept.get(t.concept)?.name : undefined,
  };
}

/** 学习一个问题需要先懂的词：依次取题干、答案、先决理由与分支、各说推演链、教科书概括 */
export function termsOfQuestion(ix: Index, qid: string, max = 8): string[] {
  const q = ix.question.get(qid);
  if (!q) return [];
  const m = termMatcher(ix);
  const texts: (string | undefined)[] = [
    q.text,
    q.summary,
    ...q.answers.flatMap((a) => [a.label, a.summary]),
    ...(ix.prereqsOf.get(qid) ?? []).flatMap((p) => [ix.question.get(p.requires)?.text, p.why, ...p.branches.map((b) => b.leadsTo)]),
    ...ix.db.positions.filter((p) => p.question === qid).flatMap((p) => p.derivation),
    ...(ix.bookViewsOfQuestion.get(qid) ?? []).flatMap((b) => [b.summary, ...b.reasons]),
  ];
  const out: string[] = [];
  for (const t of texts) for (const id of termsIn(t, m)) if (!out.includes(id)) out.push(id);
  return out.slice(0, max);
}
