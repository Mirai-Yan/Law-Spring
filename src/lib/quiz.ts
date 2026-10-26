/**
 * 练习题生成：完全从知识库确定性地出题，不调用大模型。
 * 设计原则：每道题只能有一个正确答案——凡是可能同时成立的选项（阵营内另说、同结论的学说、间接先决问题）一律不作为干扰项。
 */
import { ancestors, answerLabel, descendants, theoryAnswer, type Index } from "./graph";
import { PREREQ_KIND_LABEL, type Area, type Theory } from "./schema";

export type QuizKind = "theory-conclusion" | "conclusion-theory" | "prereq" | "scholar-theory";

export const QUIZ_KIND_LABEL: Record<QuizKind, string> = {
  "theory-conclusion": "学说 → 结论",
  "conclusion-theory": "结论 → 学说",
  prereq: "先决问题",
  "scholar-theory": "学者 → 学说",
};

export type QuizOption = { id: string; label: string };

export type QuizItem = {
  id: string;
  kind: QuizKind;
  prompt: string;
  context?: string;
  options: QuizOption[];
  correct: string;
  /** 答后讲解（可含 wiki 链接） */
  explain: string[];
  links: { href: string; label: string }[];
  area?: Area;
  /** 所属根据论（学说所回答的问题 id） */
  foundation?: string;
  /** 题目涉及的问题（问题页的导引据此挑题） */
  questions: string[];
  /** 题目依据的数据是否都已核实 */
  verified: boolean;
};

const MAX_OPTIONS = 4;

function theoryGroups(ix: Index): Map<string, Theory[]> {
  const m = new Map<string, Theory[]>();
  for (const t of ix.db.theories) {
    const g = m.get(t.question) ?? [];
    g.push(t);
    m.set(t.question, g);
  }
  return m;
}

const areaOf = (ix: Index, qid: string) => ix.concept.get(ix.question.get(qid)?.concept ?? "")?.area;

export function allQuizItems(ix: Index): QuizItem[] {
  const items: QuizItem[] = [];
  const groups = theoryGroups(ix);

  /* ---- 1. 学说 → 结论 ---- */
  for (const t of ix.db.theories) {
    for (const q of ix.db.questions) {
      const ta = theoryAnswer(ix, t.id, q.id);
      if (!ta || ta.own || !ta.answer || !ta.position) continue;
      const alt = new Set(ta.position.alternatives.map((a) => a.answer));
      const others = q.answers.filter((a) => a.id !== ta.answer && !alt.has(a.id));
      if (others.length === 0) continue;
      const correct = q.answers.find((a) => a.id === ta.answer)!;
      const options = [correct, ...others.slice(0, MAX_OPTIONS - 1)].map((a) => ({ id: a.id, label: a.label }));
      const explain = [...ta.position.derivation];
      if (ta.position.alternatives.length)
        explain.push(`注意：阵营内另有「${ta.position.alternatives.map((a) => answerLabel(ix, q.id, a.answer)).join("」「")}」的见解。`);
      items.push({
        id: `tc:${t.id}:${q.id}`,
        kind: "theory-conclusion",
        prompt: `按照「${t.name}」的典型推演：${q.text}`,
        options,
        correct: correct.id,
        explain,
        links: [
          { href: `/question/${q.id}/`, label: "这个问题的完整页面" },
          { href: `/lens/?theory=${t.id}`, label: `${t.name}的透镜` },
        ],
        area: areaOf(ix, q.id),
        foundation: t.question,
        questions: [q.id],
        verified: ta.position.status === "verified" && t.status === "verified",
      });
    }
  }

  /* ---- 2. 结论 → 学说 ---- */
  for (const [fq, group] of groups) {
    if (group.length < 2) continue;
    for (const q of ix.db.questions) {
      if (q.id === fq) continue; // 学说本身的命题，太直白
      const rows = group
        .map((t) => ({ t, ta: theoryAnswer(ix, t.id, q.id) }))
        .filter((r) => r.ta?.answer && r.ta.position);
      for (const { t, ta } of rows) {
        const a = ta!.answer!;
        const distractors = rows.filter(
          (r) =>
            r.t.id !== t.id &&
            r.ta!.answer !== a &&
            !r.ta!.position!.alternatives.some((x) => x.answer === a),
        );
        if (distractors.length === 0) continue;
        const options = [t, ...distractors.slice(0, MAX_OPTIONS - 1).map((r) => r.t)].map((x) => ({ id: x.id, label: x.name }));
        items.push({
          id: `ct:${t.id}:${q.id}`,
          kind: "conclusion-theory",
          prompt: `在「${q.text}」上，下列哪一种学说的典型结论是「${answerLabel(ix, q.id, a)}」？`,
          context: `学说均就「${ix.question.get(fq)?.text}」作答`,
          options,
          correct: t.id,
          explain: [...ta!.position!.derivation],
          links: [{ href: `/question/${q.id}/`, label: "这个问题的完整页面" }],
          area: areaOf(ix, q.id),
          foundation: fq,
          questions: [q.id],
          verified: ta!.position!.status === "verified" && t.status === "verified",
        });
      }
    }
  }

  /* ---- 3. 先决问题 ---- */
  for (const e of ix.db.prerequisites) {
    const Q = ix.question.get(e.question);
    const R = ix.question.get(e.requires);
    if (!Q || !R) continue;
    const excluded = new Set([Q.id, ...ancestors(ix, Q.id)]);
    // 干扰项优先取下游问题（最容易混淆先后），再取同专题、同体系位置的问题
    const pool = [
      ...[...descendants(ix, Q.id)],
      ...(ix.questionsOfConcept.get(Q.concept) ?? []).map((x) => x.id),
      ...ix.db.questions.filter((x) => areaOf(ix, x.id) === areaOf(ix, Q.id)).map((x) => x.id),
    ].filter((id, i, arr) => !excluded.has(id) && arr.indexOf(id) === i);
    if (pool.length === 0) continue;
    const options = [R.id, ...pool.slice(0, MAX_OPTIONS - 1)].map((id) => ({ id, label: ix.question.get(id)!.text }));
    items.push({
      id: `pq:${Q.id}:${R.id}`,
      kind: "prereq",
      prompt: `要回答「${Q.text}」，下列哪一个是它的直接先决问题？`,
      options,
      correct: R.id,
      explain: [`${PREREQ_KIND_LABEL[e.kind]}：${e.why}`],
      links: [
        { href: `/question/${Q.id}/`, label: "查看它的先决问题树" },
        { href: `/question/${R.id}/`, label: "先决问题的页面" },
      ],
      area: areaOf(ix, Q.id),
      questions: [Q.id, R.id],
      verified: e.status === "verified",
    });
  }

  /* ---- 4. 学者 → 学说 ---- */
  for (const [fq, group] of groups) {
    if (group.length < 2) continue;
    for (const t of group) {
      for (const sid of t.proponents) {
        const s = ix.scholar.get(sid);
        if (!s) continue;
        if (group.some((o) => o.id !== t.id && o.proponents.includes(sid))) continue; // 同组内归属不唯一
        const others = group.filter((o) => o.id !== t.id).slice(0, MAX_OPTIONS - 1);
        items.push({
          id: `st:${sid}:${t.id}`,
          kind: "scholar-theory",
          prompt: `${s.name}${s.nameOriginal && s.nameOriginal !== s.name ? `（${s.nameOriginal}）` : ""}通常被归入哪一种学说？`,
          context: `就「${ix.question.get(fq)?.text}」而言`,
          options: [t, ...others].map((x) => ({ id: x.id, label: x.name })),
          correct: t.id,
          explain: [t.thesis, ...(t.status !== "verified" || s.status !== "verified" ? ["学者的学说归属为编者归纳，尚待核实。"] : [])],
          links: [
            { href: `/scholar/${sid}/`, label: `${s.name}的页面` },
            { href: `/lens/?theory=${t.id}`, label: `${t.name}的透镜` },
          ],
          foundation: fq,
          questions: [fq],
          verified: t.status === "verified" && s.status === "verified",
        });
      }
    }
  }

  return items;
}

/* ------------------------------------------------------------------ */

/** 可复现的伪随机数（mulberry32） */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type QuizFilter = {
  area?: Area | "all";
  foundation?: string | "all";
  kinds?: QuizKind[];
  verifiedOnly?: boolean;
  /** 只要涉及这个问题的题 */
  question?: string;
};

export function filterQuiz(items: QuizItem[], f: QuizFilter): QuizItem[] {
  return items.filter(
    (it) =>
      (!f.area || f.area === "all" || it.area === f.area) &&
      (!f.foundation || f.foundation === "all" || it.foundation === f.foundation) &&
      (!f.kinds || f.kinds.includes(it.kind)) &&
      (!f.verifiedOnly || it.verified) &&
      (!f.question || it.questions.includes(f.question)),
  );
}

/** 抽一组题，并打乱每道题的选项顺序 */
export function pickQuiz(items: QuizItem[], count: number, seed: number): QuizItem[] {
  const rand = rng(seed);
  return shuffle(items, rand)
    .slice(0, count)
    .map((it) => ({ ...it, options: shuffle(it.options, rand) }));
}
