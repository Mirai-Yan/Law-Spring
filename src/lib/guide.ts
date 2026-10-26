/**
 * 问题页的学习导引：把知识库里已有的数据（先决链、分支去向、各说推演链、教科书论述）
 * 排成一条论证路线。纯函数，客户端与测试共用；不调用大模型。
 */
import { termLite, termsOfQuestion, type TermLite } from "./glossary";
import { answerLabel, learningOrder, nearestFoundations, theoryAnswer, type Index } from "./graph";
import type { Answer, Prerequisite } from "./schema";

export const MAX_STEPS = 6;

/** 论证台阶上的一级：先回答 P，以及 P 的答案把论证引向哪里 */
export type Rung = {
  qid: string;
  text: string;
  foundation: boolean;
  answers: Answer[];
  /** P 通向哪个问题（本题或台阶上更靠近本题的一级） */
  toward: string;
  towardText: string;
  edge: Prerequisite;
};

export type TheoryLine = {
  id: string;
  name: string;
  answer: string | null;
  answerLabel: string;
  /** 本题上的推演链；学说本身就是本题的主张时，用它的命题 */
  steps: string[];
  own: boolean;
  note?: string;
};

export type GuideData = {
  qid: string;
  text: string;
  summary?: string;
  answers: Answer[];
  terms: TermLite[];
  rungs: Rung[];
  /** 没排进台阶的其他先决问题数 */
  more: number;
  theories: TheoryLine[];
  book?: { answer: string | null; answerLabel: string; summary: string; reasons: string[] };
};

/** 向上的距离：直接先决问题为 1 */
function depths(ix: Index, qid: string): Map<string, number> {
  const d = new Map<string, number>([[qid, 0]]);
  const queue = [qid];
  while (queue.length) {
    const u = queue.shift()!;
    for (const p of ix.prereqsOf.get(u) ?? [])
      if (!d.has(p.requires)) {
        d.set(p.requires, d.get(u)! + 1);
        queue.push(p.requires);
      }
  }
  return d;
}

/**
 * 选出论证台阶：直接先决问题与最近的根据论优先，其余按距离补足，最多 max 级；
 * 再按学习顺序排列（根据论在前，本题之前的一级在最后）。
 */
export function guideRungs(ix: Index, qid: string, max = MAX_STEPS): { rungs: Rung[]; more: number } {
  const d = depths(ix, qid);
  const all = [...d.keys()].filter((id) => id !== qid);
  const pick = new Set<string>();
  const add = (id: string) => pick.size < max && pick.add(id);
  (ix.prereqsOf.get(qid) ?? []).forEach((p) => add(p.requires));
  nearestFoundations(ix, qid).forEach(add);
  [...all].sort((a, b) => d.get(a)! - d.get(b)!).forEach(add);

  const order = learningOrder(ix, qid).filter((id) => pick.has(id));
  const rungs: Rung[] = [];
  for (const [i, id] of order.entries()) {
    const q = ix.question.get(id);
    if (!q) continue;
    // 它通向哪里：优先直接通向本题，否则通向台阶上排在它后面、离本题最近的一级
    const edges = ix.dependentsOf.get(id) ?? [];
    const later = [qid, ...order.slice(i + 1).reverse()];
    const edge = later.map((t) => edges.find((e) => e.question === t)).find(Boolean) ?? edges.find((e) => d.has(e.question));
    if (!edge) continue;
    rungs.push({
      qid: id,
      text: q.text,
      foundation: q.level === "foundation",
      answers: q.answers,
      toward: edge.question,
      towardText: ix.question.get(edge.question)?.text ?? "",
      edge,
    });
  }
  return { rungs, more: all.length - rungs.length };
}

export function guideData(ix: Index, qid: string): GuideData | null {
  const q = ix.question.get(qid);
  if (!q) return null;
  const { rungs, more } = guideRungs(ix, qid);
  const theories: TheoryLine[] = [];
  for (const t of ix.db.theories) {
    const ta = theoryAnswer(ix, t.id, qid);
    if (!ta) continue;
    theories.push({
      id: t.id,
      name: t.name,
      answer: ta.answer,
      answerLabel: answerLabel(ix, qid, ta.answer),
      steps: ta.own ? [t.thesis] : (ta.position?.derivation ?? []),
      own: ta.own,
      note: ta.position?.note,
    });
  }
  const bv = (ix.bookViewsOfQuestion.get(qid) ?? [])[0];
  return {
    qid,
    text: q.text,
    summary: q.summary,
    answers: q.answers,
    terms: termsOfQuestion(ix, qid).map((id) => termLite(ix, ix.term.get(id)!)),
    rungs,
    more,
    theories,
    book: bv && { answer: bv.answer, answerLabel: bv.answer ? answerLabel(ix, qid, bv.answer) : "未明确表态", summary: bv.summary, reasons: bv.reasons.slice(0, 3) },
  };
}

/**
 * 直觉与推演的对照：找一个主张「直觉答案」的学说，看它在哪一级台阶上与用户的选择不同。
 * 返回第一处分歧；没有可比的学说或没有分歧时返回 null。
 */
export function divergence(
  ix: Index,
  data: GuideData,
  intuition: string,
  selection: Record<string, string>,
): { theory: string; rung: number; theirs: string; yours: string } | null {
  for (const t of data.theories.filter((x) => x.answer === intuition)) {
    for (const [i, r] of data.rungs.entries()) {
      const mine = selection[r.qid];
      const theirs = theoryAnswer(ix, t.id, r.qid)?.answer;
      if (mine && theirs && mine !== theirs)
        return { theory: t.name, rung: i + 1, theirs: answerLabel(ix, r.qid, theirs), yours: answerLabel(ix, r.qid, mine) };
    }
  }
  return null;
}
