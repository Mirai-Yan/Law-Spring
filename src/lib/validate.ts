import { buildTermMatcher, termsIn } from "./glossary";
import { buildIndex, findCycles, parseWikiLinks, reachesFoundation, wikiTarget } from "./graph";
import type { Db, Source } from "./schema";

export type Finding = { level: "error" | "warning"; where: string; message: string };

/** 校验引用完整性、奇点、出处规则、先决图无环、wiki 链接 */
export function validateDb(db: Db): Finding[] {
  const ix = buildIndex(db);
  const out: Finding[] = [];
  const err = (where: string, message: string) => out.push({ level: "error", where, message });
  const warn = (where: string, message: string) => out.push({ level: "warning", where, message });

  /* ---- id 唯一 ---- */
  const idKinds = [
    "jurisdictions",
    "scholars",
    "works",
    "concepts",
    "questions",
    "theories",
    "events",
    "dialogues",
    "spectra",
    "bookViews",
    "crimes",
    "terms",
  ] as const;
  for (const kind of idKinds) {
    const seen = new Set<string>();
    for (const item of db[kind] as { id: string }[]) {
      if (seen.has(item.id)) err(`${kind}:${item.id}`, "id 重复");
      seen.add(item.id);
    }
  }

  const has = {
    jurisdiction: (id: string) => ix.jurisdiction.has(id),
    scholar: (id: string) => ix.scholar.has(id),
    work: (id: string) => ix.work.has(id),
    concept: (id: string) => ix.concept.has(id),
    question: (id: string) => ix.question.has(id),
    theory: (id: string) => ix.theory.has(id),
    event: (id: string) => ix.event.has(id),
  };
  const ref = (where: string, kind: keyof typeof has, id: string | undefined) => {
    if (id && !has[kind](id)) err(where, `引用了不存在的 ${kind}「${id}」`);
  };
  const answerOf = (where: string, qid: string, ans: string | null | undefined) => {
    if (!ans) return;
    const q = ix.question.get(qid);
    if (q && !q.answers.some((a) => a.id === ans))
      err(where, `问题「${qid}」没有答案「${ans}」`);
  };

  /* ---- 出处规则 ---- */
  type Claimish = { status: string; sources: Source[] };
  const claimRules = (where: string, c: Claimish) => {
    for (const s of c.sources) ref(where, "work", s.work);
    if (c.status === "verified" && c.sources.length === 0)
      err(where, "已标为 verified，但没有任何出处");
  };

  /* ---- wiki 链接 ---- */
  const links = (where: string, ...texts: (string | undefined)[]) => {
    for (const t of texts) {
      if (!t) continue;
      for (const l of parseWikiLinks(t))
        if (!wikiTarget(ix, l.kind, l.id)) err(where, `wiki 链接失效：[[${l.kind}:${l.id}]]`);
    }
  };

  for (const s of db.scholars) {
    const w = `scholars:${s.id}`;
    ref(w, "jurisdiction", s.jurisdiction);
    s.teachers.forEach((t) => ref(w, "scholar", t));
    s.influencedBy.forEach((t) => ref(w, "scholar", t));
    if (s.teachers.includes(s.id)) err(w, "不能以自己为师");
    claimRules(w, s);
    links(w, s.bio);
  }

  for (const bv of db.bookViews) {
    const w = `bookViews:${bv.id}`;
    ref(w, "work", bv.work);
    ref(w, "question", bv.question);
    answerOf(w, bv.question, bv.answer);
    for (const r of bv.reported) {
      answerOf(w, bv.question, r.answer);
      if (r.theory && !ix.theory.has(r.theory)) err(w, `引用了不存在的学说「${r.theory}」`);
      r.scholars.forEach((x) => ref(w, "scholar", x));
    }
    claimRules(w, bv);
    links(w, bv.summary, ...bv.reasons, ...bv.reported.map((r) => r.summary));
  }

  const crimeIds = new Set(db.crimes.map((c) => c.id));
  for (const c of db.crimes) {
    const w = `crimes:${c.id}`;
    c.issues.forEach((q) => ref(w, "question", q));
    for (const r of c.related) if (!crimeIds.has(r.crime)) err(w, `引用了不存在的罪名「${r.crime}」`);
    if (c.article && !/^第\d+条/.test(c.article)) warn(w, `条文写法应为「第N条」：${c.article}`);
    claimRules(w, c);
    links(w, c.legalInterest, ...c.elements, ...c.related.map((r) => r.note));
  }

  const wikiSeen = new Set<string>();
  for (const sw of db.scholarWiki) {
    const w = `scholarWiki:${sw.scholar}`;
    ref(w, "scholar", sw.scholar);
    if (wikiSeen.has(sw.scholar)) err(w, "同一学者有两条 Wikidata 资料");
    wikiSeen.add(sw.scholar);
    [...sw.advisors, ...sw.students].forEach((p) => ref(w, "scholar", p.scholar));
  }

  for (const wk of db.works) {
    const w = `works:${wk.id}`;
    ref(w, "jurisdiction", wk.jurisdiction);
    wk.authors.forEach((a) => ref(w, "scholar", a));
    if (wk.authors.length === 0 && !wk.authorText) warn(w, "没有作者");
    claimRules(w, wk);
  }

  for (const c of db.concepts) {
    const w = `concepts:${c.id}`;
    claimRules(w, c);
    links(w, c.summary);
    const origins = db.events.filter((e) => e.originOf === c.id);
    if (origins.length === 0) {
      if (c.originPending) warn(w, "奇点待考");
      else err(w, "没有奇点（需要一个 originOf 指向本概念的事件）");
    }
    if (origins.length > 1) err(w, `有 ${origins.length} 个奇点：${origins.map((e) => e.id).join("、")}`);
    if (!(ix.questionsOfConcept.get(c.id)?.length)) warn(w, "还没有任何问题（question）");
  }

  for (const q of db.questions) {
    const w = `questions:${q.id}`;
    ref(w, "concept", q.concept);
    const ids = new Set<string>();
    for (const a of q.answers) {
      if (ids.has(a.id)) err(w, `答案 id 重复：${a.id}`);
      ids.add(a.id);
    }
    claimRules(w, q);
    links(w, q.summary);
    if (q.level !== "foundation" && !reachesFoundation(ix, q.id))
      warn(w, "无法追溯到任何根据论问题");
  }

  const edgeSeen = new Set<string>();
  for (const p of db.prerequisites) {
    const w = `prerequisites:${p.question}<-${p.requires}`;
    ref(w, "question", p.question);
    ref(w, "question", p.requires);
    if (p.question === p.requires) err(w, "问题不能以自己为先决");
    if (edgeSeen.has(w)) err(w, "先决边重复");
    edgeSeen.add(w);
    for (const b of p.branches) answerOf(w, p.requires, b.answer);
    claimRules(w, p);
    links(w, p.why, ...p.branches.map((b) => b.leadsTo));
  }
  for (const cyc of findCycles(db.prerequisites))
    err(`prerequisites`, `先决关系成环：${cyc.join(" → ")}`);

  for (const t of db.theories) {
    const w = `theories:${t.id}`;
    ref(w, "question", t.question);
    answerOf(w, t.question, t.answer);
    t.proponents.forEach((s) => ref(w, "scholar", s));
    t.jurisdictions.forEach((j) => ref(w, "jurisdiction", j));
    claimRules(w, t);
    links(w, t.thesis);
  }

  const posSeen = new Set<string>();
  for (const p of db.positions) {
    const w = `positions:${p.theory}@${p.question}`;
    ref(w, "theory", p.theory);
    ref(w, "question", p.question);
    answerOf(w, p.question, p.answer);
    p.scholars.forEach((s) => ref(w, "scholar", s));
    for (const a of p.alternatives) {
      answerOf(w, p.question, a.answer);
      a.jurisdictions.forEach((j) => ref(w, "jurisdiction", j));
    }
    if (posSeen.has(w)) err(w, "同一学说在同一问题上有两条立场");
    posSeen.add(w);
    if (ix.theory.get(p.theory)?.question === p.question)
      warn(w, "学说自己回答的问题无需再写 position");
    claimRules(w, p);
    links(w, p.note, ...p.derivation, ...p.alternatives.map((a) => a.note));
  }

  for (const sp of db.scholarPositions) {
    const w = `scholarPositions:${sp.scholar}@${sp.question}`;
    ref(w, "scholar", sp.scholar);
    ref(w, "question", sp.question);
    ref(w, "theory", sp.deviatesFrom);
    answerOf(w, sp.question, sp.answer);
    const ta = ix.positionOf.get(`${sp.deviatesFrom}@${sp.question}`);
    if (ta && ta.answer === sp.answer) warn(w, "标为偏离，但与该学说的立场相同");
    claimRules(w, sp);
    links(w, sp.note);
  }

  for (const e of db.events) {
    const w = `events:${e.id}`;
    ref(w, "jurisdiction", e.jurisdiction);
    e.concepts.forEach((c) => ref(w, "concept", c));
    e.scholars.forEach((s) => ref(w, "scholar", s));
    e.works.forEach((x) => ref(w, "work", x));
    e.derivedFrom.forEach((x) => ref(w, "event", x));
    ref(w, "concept", e.originOf);
    if (e.type === "origin" && !e.originOf) err(w, "type 为 origin，但没有写 originOf");
    if (e.originOf && e.type !== "origin") err(w, "写了 originOf，但 type 不是 origin");
    if (e.originOf && !e.originType) err(w, "奇点事件需要写 originType");
    if (e.originOf && !e.concepts.includes(e.originOf)) err(w, "originOf 的概念也应列在 concepts 中");
    for (const parent of e.derivedFrom) {
      const pe = ix.event.get(parent);
      if (pe && pe.year > e.year) warn(w, `派生自更晚的事件 ${parent}（${pe.year}）`);
    }
    claimRules(w, e);
    links(w, e.description);
  }

  for (const d of db.dialogues) {
    const w = `dialogues:${d.id}`;
    ref(w, "concept", d.concept);
    d.jurisdictions.forEach((j) => ref(w, "jurisdiction", j));
    const turnIds = new Set(d.turns.map((t) => t.id));
    for (const t of d.turns) {
      ref(w, "scholar", t.scholar);
      ref(w, "work", t.work);
      if (t.respondsTo && !turnIds.has(t.respondsTo)) err(w, `回合 ${t.id} 回应了不存在的回合 ${t.respondsTo}`);
      links(w, t.claim);
    }
    claimRules(w, d);
    links(w, d.summary);
  }

  for (const r of db.relations) {
    const w = `relations:${r.from}-${r.type}-${r.to}`;
    ref(w, "concept", r.from);
    ref(w, "concept", r.to);
    claimRules(w, r);
    links(w, r.description);
  }

  for (const s of db.spectra) {
    const w = `spectra:${s.id}`;
    ref(w, "concept", s.concept);
    for (const p of s.placements) {
      const [kind, id] = p.entity.split(":");
      if (kind === "scholar") ref(w, "scholar", id);
      else if (kind === "theory") ref(w, "theory", id);
      else if (kind === "jurisdiction") ref(w, "jurisdiction", id);
      else err(w, `光谱定位的 entity 格式应为 scholar:/theory:/jurisdiction:，实际是「${p.entity}」`);
      if (s.axes.length === 2 && p.y === undefined) err(w, `二维光谱的定位 ${p.entity} 缺少 y`);
      claimRules(w, p);
      links(w, p.rationale);
    }
  }

  /* ---- 基础词条 ---- */
  const termText = new Map<string, string>();
  for (const t of db.terms) {
    const w = `terms:${t.id}`;
    ref(w, "concept", t.concept);
    claimRules(w, t);
    for (const x of [t.term, ...t.aliases]) {
      const prev = termText.get(x);
      if (prev && prev !== t.id) err(w, `「${x}」已是词条 ${prev} 的名称或别名`);
      termText.set(x, t.id);
    }
    for (const x of t.notIn) if (!x.includes(t.term) && !t.aliases.some((a) => x.includes(a))) warn(w, `排除词组「${x}」并不包含本词条`);
  }
  if (db.terms.length) {
    // 词条要用得上：全库正文里一次都没出现的，提示一下
    const m = buildTermMatcher(db.terms);
    const used = new Set<string>();
    const texts = [
      ...db.questions.flatMap((q) => [q.text, q.summary, ...q.answers.flatMap((a) => [a.label, a.summary])]),
      ...db.prerequisites.flatMap((p) => [p.why, ...p.branches.map((b) => b.leadsTo)]),
      ...db.positions.flatMap((p) => [...p.derivation, p.note]),
      ...db.bookViews.flatMap((b) => [b.summary, ...b.reasons]),
      ...db.concepts.map((c) => c.summary),
      ...db.crimes.flatMap((c) => [c.legalInterest, ...c.elements]),
    ];
    for (const t of texts) for (const id of termsIn(t, m)) used.add(id);
    for (const t of db.terms) if (!used.has(t.id)) warn(`terms:${t.id}`, "全库正文中没有出现这个词条");
  }

  return out;
}
