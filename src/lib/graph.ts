/**
 * 纯函数：索引、先决关系推导（溯源、拓扑排序、同根、分岔推演）、透镜、演化回溯。
 * 不依赖 fs，服务端和客户端组件都可以用。
 */
import type {
  Concept,
  Crime,
  Db,
  LawEvent,
  Position,
  Prerequisite,
  Question,
  Relation,
  ScholarPosition,
  Theory,
} from "./schema";

/* ------------------------------------------------------------------ */
/*  索引                                                               */
/* ------------------------------------------------------------------ */

export type Index = ReturnType<typeof buildIndex>;

function byId<T extends { id: string }>(arr: T[]): Map<string, T> {
  return new Map(arr.map((x) => [x.id, x]));
}

function groupBy<T>(arr: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function buildIndex(db: Db) {
  const questionOrder = new Map(db.questions.map((q, i) => [q.id, i]));
  return {
    db,
    jurisdiction: byId(db.jurisdictions),
    scholar: byId(db.scholars),
    work: byId(db.works),
    concept: byId(db.concepts),
    question: byId(db.questions),
    theory: byId(db.theories),
    event: byId(db.events),
    dialogue: byId(db.dialogues),
    spectrum: byId(db.spectra),
    questionOrder,
    /** 下游问题 → 它的先决边 */
    prereqsOf: groupBy(db.prerequisites, (p) => p.question),
    /** 先决问题 → 依赖它的边 */
    dependentsOf: groupBy(db.prerequisites, (p) => p.requires),
    questionsOfConcept: groupBy(db.questions, (q) => q.concept),
    eventsOfConcept: (() => {
      const m = new Map<string, LawEvent[]>();
      for (const e of db.events)
        for (const c of e.concepts) {
          const list = m.get(c);
          if (list) list.push(e);
          else m.set(c, [e]);
        }
      return m;
    })(),
    positionOf: new Map(db.positions.map((p) => [`${p.theory}@${p.question}`, p])),
    theoriesOfQuestion: groupBy(db.theories, (t) => t.question),
    /** 学者 id → Wikidata 基本信息 */
    scholarWiki: new Map(db.scholarWiki.map((w) => [w.scholar, w])),
    crime: byId(db.crimes),
    term: byId(db.terms),
    bookViewsOfQuestion: groupBy(db.bookViews, (b) => b.question),
    crimesOfQuestion: (() => {
      const m = new Map<string, Crime[]>();
      for (const c of db.crimes) for (const q of c.issues) m.set(q, [...(m.get(q) ?? []), c]);
      return m;
    })(),
  };
}

/* ------------------------------------------------------------------ */
/*  先决关系：环检测                                                     */
/* ------------------------------------------------------------------ */

/** 返回先决图中的所有环（每个环是问题 id 序列，首尾相同） */
export function findCycles(prereqs: Pick<Prerequisite, "question" | "requires">[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const p of prereqs) {
    const list = adj.get(p.question);
    if (list) list.push(p.requires);
    else adj.set(p.question, [p.requires]);
  }
  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const visit = (u: string) => {
    color.set(u, GREY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GREY) {
        const start = stack.indexOf(v);
        cycles.push([...stack.slice(start), v]);
      } else if (c === WHITE) {
        visit(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };

  for (const u of adj.keys()) if ((color.get(u) ?? WHITE) === WHITE) visit(u);
  return cycles;
}

/* ------------------------------------------------------------------ */
/*  先决关系：上溯、下游                                                  */
/* ------------------------------------------------------------------ */

export function ancestors(ix: Index, qid: string): Set<string> {
  const seen = new Set<string>();
  const stack = [qid];
  while (stack.length) {
    const u = stack.pop()!;
    for (const p of ix.prereqsOf.get(u) ?? []) {
      if (!seen.has(p.requires)) {
        seen.add(p.requires);
        stack.push(p.requires);
      }
    }
  }
  seen.delete(qid);
  return seen;
}

export function descendants(ix: Index, qid: string): Set<string> {
  const seen = new Set<string>();
  const stack = [qid];
  while (stack.length) {
    const u = stack.pop()!;
    for (const p of ix.dependentsOf.get(u) ?? []) {
      if (!seen.has(p.question)) {
        seen.add(p.question);
        stack.push(p.question);
      }
    }
  }
  seen.delete(qid);
  return seen;
}

export type PrereqTreeNode = {
  question: string;
  /** 从父节点（下游）指向本节点（先决）的边；根节点没有 */
  edge?: Prerequisite;
  children: PrereqTreeNode[];
  /** 本节点在树中已经展开过，这里只做引用 */
  repeated?: boolean;
};

/** 先决问题树：从当前问题向上展开，直到根据论；DAG 中重复出现的节点只展开一次 */
export function prereqTree(ix: Index, qid: string): PrereqTreeNode {
  const expanded = new Set<string>();
  const build = (id: string, edge?: Prerequisite): PrereqTreeNode => {
    if (expanded.has(id)) return { question: id, edge, children: [], repeated: true };
    expanded.add(id);
    const children = (ix.prereqsOf.get(id) ?? []).map((p) => build(p.requires, p));
    return { question: id, edge, children };
  };
  return build(qid);
}

/** 学习顺序：对「当前问题 + 全部先决问题」做拓扑排序，根据论在前 */
export function learningOrder(ix: Index, qid: string): string[] {
  const nodes = new Set([qid, ...ancestors(ix, qid)]);
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n, 0);
  // 边方向：requires → question（先学 requires）
  for (const n of nodes)
    for (const p of ix.prereqsOf.get(n) ?? [])
      if (nodes.has(p.requires)) indeg.set(n, (indeg.get(n) ?? 0) + 1);

  const levelRank = { foundation: 0, intermediate: 1, applied: 2 } as const;
  const rank = (id: string) => {
    const q = ix.question.get(id);
    return (q ? levelRank[q.level] : 3) * 10000 + (ix.questionOrder.get(id) ?? 9999);
  };

  const ready = [...nodes].filter((n) => indeg.get(n) === 0).sort((a, b) => rank(a) - rank(b));
  const out: string[] = [];
  while (ready.length) {
    const u = ready.shift()!;
    out.push(u);
    for (const p of ix.dependentsOf.get(u) ?? []) {
      if (!nodes.has(p.question)) continue;
      const d = (indeg.get(p.question) ?? 0) - 1;
      indeg.set(p.question, d);
      if (d === 0) {
        ready.push(p.question);
        ready.sort((a, b) => rank(a) - rank(b));
      }
    }
  }
  return out;
}

/** 最近的根据论：向上走，遇到 level=foundation 的问题就收下并停止向上 */
export function nearestFoundations(ix: Index, qid: string): string[] {
  const out = new Set<string>();
  const seen = new Set<string>([qid]);
  const queue = (ix.prereqsOf.get(qid) ?? []).map((p) => p.requires);
  while (queue.length) {
    const u = queue.shift()!;
    if (seen.has(u)) continue;
    seen.add(u);
    if (ix.question.get(u)?.level === "foundation") {
      out.add(u);
      continue;
    }
    for (const p of ix.prereqsOf.get(u) ?? []) queue.push(p.requires);
  }
  return [...out];
}

/** 能否一路追溯到至少一个根据论 */
export function reachesFoundation(ix: Index, qid: string): boolean {
  if (ix.question.get(qid)?.level === "foundation") return true;
  return [...ancestors(ix, qid)].some((a) => ix.question.get(a)?.level === "foundation");
}

/** 同根问题：与当前问题共享同一个「最近根据论」、但不在它上下游链上的问题 */
export function sameRootQuestions(ix: Index, qid: string): { root: string; questions: string[] }[] {
  const roots = nearestFoundations(ix, qid);
  const exclude = new Set([qid, ...ancestors(ix, qid), ...descendants(ix, qid)]);
  const levelRank = { applied: 0, intermediate: 1, foundation: 2 } as const;
  return roots
    .map((root) => {
      const qs = ix.db.questions
        .filter((q) => !exclude.has(q.id) && nearestFoundations(ix, q.id).includes(root))
        .sort((a, b) => levelRank[a.level] - levelRank[b.level])
        .map((q) => q.id);
      return { root, questions: qs };
    })
    .filter((g) => g.questions.length > 0);
}

/** 下游影响：直接依赖它的边，以及更远的下游问题 */
export function downstream(ix: Index, qid: string): { direct: Prerequisite[]; indirect: string[] } {
  const direct = ix.dependentsOf.get(qid) ?? [];
  const directIds = new Set(direct.map((p) => p.question));
  const indirect = [...descendants(ix, qid)].filter((d) => !directIds.has(d));
  return { direct, indirect };
}

export type ConceptLink = {
  relation: Relation;
  other: Concept;
  questions: Question[];
};

/** 概念层面的挂钩（对称问题、功能对应），双向查找 */
export function conceptLinks(
  ix: Index,
  conceptId: string,
  types: Relation["type"][] = ["symmetric", "functional_equivalent"],
): ConceptLink[] {
  const out: ConceptLink[] = [];
  for (const r of ix.db.relations) {
    if (!types.includes(r.type)) continue;
    const otherId = r.from === conceptId ? r.to : r.to === conceptId ? r.from : null;
    if (!otherId) continue;
    const other = ix.concept.get(otherId);
    if (!other) continue;
    const levelRank = { applied: 0, intermediate: 1, foundation: 2 } as const;
    const questions = [...(ix.questionsOfConcept.get(otherId) ?? [])].sort(
      (a, b) => levelRank[a.level] - levelRank[b.level],
    );
    out.push({ relation: r, other, questions });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  学说 × 问题                                                         */
/* ------------------------------------------------------------------ */

export type TheoryAnswer = {
  answer: string | null;
  /** 这是学说自己所回答的根据论问题 */
  own: boolean;
  position?: Position;
};

export function theoryAnswer(ix: Index, theoryId: string, qid: string): TheoryAnswer | undefined {
  const t = ix.theory.get(theoryId);
  if (!t) return undefined;
  if (t.question === qid) return { answer: t.answer, own: true };
  const p = ix.positionOf.get(`${theoryId}@${qid}`);
  if (!p) return undefined;
  return { answer: p.answer, own: false, position: p };
}

export type Compatibility = {
  theory: Theory;
  matched: string[];
  conflicts: string[];
  unknown: string[];
};

/** 分岔推演：根据用户在各问题上选的答案，判断哪些学说与之相容 */
export function compatibility(ix: Index, selection: Record<string, string>): Compatibility[] {
  const picked = Object.entries(selection);
  return ix.db.theories
    .map((theory) => {
      const matched: string[] = [];
      const conflicts: string[] = [];
      const unknown: string[] = [];
      for (const [qid, ans] of picked) {
        const ta = theoryAnswer(ix, theory.id, qid);
        if (!ta || ta.answer === null) unknown.push(qid);
        else if (ta.answer === ans) matched.push(qid);
        else conflicts.push(qid);
      }
      return { theory, matched, conflicts, unknown };
    })
    .filter((c) => c.matched.length > 0)
    .sort((a, b) => a.conflicts.length - b.conflicts.length || b.matched.length - a.matched.length);
}

/** 套用某学说：把它在这些问题上的答案作为选择 */
export function applyTheory(ix: Index, theoryId: string, qids: string[]): Record<string, string> {
  const sel: Record<string, string> = {};
  for (const q of qids) {
    const ta = theoryAnswer(ix, theoryId, q);
    if (ta?.answer) sel[q] = ta.answer;
  }
  return sel;
}

export type LensRow = {
  question: Question;
  answer: string | null;
  own: boolean;
  position?: Position;
  deviations: ScholarPosition[];
};

/** 根据论透镜：某学说在各问题上的结论；按概念、层级排序 */
export function lensRows(ix: Index, theoryId: string): LensRow[] {
  const conceptOrder = new Map(ix.db.concepts.map((c, i) => [c.id, i]));
  const levelRank = { foundation: 0, intermediate: 1, applied: 2 } as const;
  const rows: LensRow[] = [];
  for (const q of ix.db.questions) {
    const ta = theoryAnswer(ix, theoryId, q.id);
    if (!ta) continue;
    rows.push({
      question: q,
      answer: ta.answer,
      own: ta.own,
      position: ta.position,
      deviations: ix.db.scholarPositions.filter(
        (sp) => sp.deviatesFrom === theoryId && sp.question === q.id,
      ),
    });
  }
  return rows.sort(
    (a, b) =>
      (conceptOrder.get(a.question.concept) ?? 0) - (conceptOrder.get(b.question.concept) ?? 0) ||
      levelRank[a.question.level] - levelRank[b.question.level],
  );
}

export function answerLabel(ix: Index, qid: string, answerId: string | null | undefined): string {
  if (!answerId) return "无统一立场";
  return ix.question.get(qid)?.answers.find((a) => a.id === answerId)?.label ?? answerId;
}

/* ------------------------------------------------------------------ */
/*  演化回溯                                                            */
/* ------------------------------------------------------------------ */

/**
 * 从某个事件沿 derivedFrom 回溯到奇点。
 * 优先寻找通往 originOf === conceptId 的最短路径；找不到时沿第一条父边走到头。
 */
export function traceToOrigin(
  events: Pick<LawEvent, "id" | "derivedFrom" | "originOf">[],
  startId: string,
  conceptId?: string,
): string[] {
  const map = new Map(events.map((e) => [e.id, e]));
  const isOrigin = (id: string) => {
    const e = map.get(id);
    return !!e?.originOf && (!conceptId || e.originOf === conceptId);
  };
  // BFS
  const prev = new Map<string, string | null>([[startId, null]]);
  const queue = [startId];
  while (queue.length) {
    const u = queue.shift()!;
    if (isOrigin(u)) {
      const path: string[] = [];
      for (let c: string | null = u; c !== null; c = prev.get(c) ?? null) path.push(c);
      return path.reverse();
    }
    for (const p of map.get(u)?.derivedFrom ?? []) {
      if (!prev.has(p) && map.has(p)) {
        prev.set(p, u);
        queue.push(p);
      }
    }
  }
  // fallback
  const path = [startId];
  const seen = new Set(path);
  let cur = map.get(startId);
  while (cur && cur.derivedFrom.length) {
    const next = cur.derivedFrom.find((p) => map.has(p) && !seen.has(p));
    if (!next) break;
    path.push(next);
    seen.add(next);
    cur = map.get(next);
  }
  return path;
}

/* ------------------------------------------------------------------ */
/*  wiki 链接                                                          */
/* ------------------------------------------------------------------ */

export const WIKI_KINDS = [
  "scholar",
  "concept",
  "question",
  "theory",
  "work",
  "event",
  "jurisdiction",
  "dialogue",
  "spectrum",
  "crime",
] as const;
export type WikiKind = (typeof WIKI_KINDS)[number];

export const WIKI_RE = /\[\[([a-z]+):([A-Za-z0-9_.-]+)(?:\|([^\]]+))?\]\]/g;

export function parseWikiLinks(text: string): { kind: string; id: string; label?: string }[] {
  const out: { kind: string; id: string; label?: string }[] = [];
  for (const m of text.matchAll(WIKI_RE)) out.push({ kind: m[1], id: m[2], label: m[3] });
  return out;
}

export function wikiTarget(ix: Index, kind: string, id: string): { href: string; label: string } | null {
  switch (kind) {
    case "scholar": {
      const s = ix.scholar.get(id);
      return s ? { href: `/scholar/${id}/`, label: s.name } : null;
    }
    case "concept": {
      const c = ix.concept.get(id);
      return c ? { href: `/concept/${id}/`, label: c.name } : null;
    }
    case "question": {
      const q = ix.question.get(id);
      return q ? { href: `/question/${id}/`, label: q.text } : null;
    }
    case "theory": {
      const t = ix.theory.get(id);
      return t ? { href: `/lens/?theory=${id}`, label: t.name } : null;
    }
    case "work": {
      const w = ix.work.get(id);
      return w ? { href: `/review/#work-${id}`, label: w.titleZh ?? w.title } : null;
    }
    case "event": {
      const e = ix.event.get(id);
      return e ? { href: `/jurisdiction/${e.jurisdiction}/#${id}`, label: e.title } : null;
    }
    case "jurisdiction": {
      const j = ix.jurisdiction.get(id);
      return j ? { href: `/jurisdiction/${id}/`, label: j.name } : null;
    }
    case "dialogue": {
      const d = ix.dialogue.get(id);
      return d ? { href: `/concept/${d.concept}/?tab=dialogue#${id}`, label: d.title } : null;
    }
    case "spectrum": {
      const s = ix.spectrum.get(id);
      return s ? { href: `/spectrum/${id}/`, label: s.title } : null;
    }
    case "crime": {
      const c = ix.crime.get(id);
      return c ? { href: `/crime/${id}/`, label: c.name } : null;
    }
    default:
      return null;
  }
}
