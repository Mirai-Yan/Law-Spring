import path from "node:path";
import { describe, expect, it } from "vitest";
import { divergence, guideData, guideRungs, MAX_STEPS } from "@/lib/guide";
import { buildIndex, learningOrder } from "@/lib/graph";
import { loadContent } from "@/lib/load";

const ix = buildIndex(loadContent(path.resolve(__dirname, "../content")).db);

describe("问题页的学习导引", () => {
  it("论证台阶按学习顺序排列，根据论在前，每一级都指向更靠近本题的问题", () => {
    const { rungs } = guideRungs(ix, "q-ad-treatment");
    expect(rungs.length).toBeGreaterThan(0);
    expect(rungs.length).toBeLessThanOrEqual(MAX_STEPS);
    const order = learningOrder(ix, "q-ad-treatment");
    const pos = rungs.map((r) => order.indexOf(r.qid));
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    // 第一级如果是根据论，后面不会再出现排在它前面的问题
    expect(rungs[0].foundation || rungs.every((r) => !r.foundation)).toBe(true);
    for (const r of rungs) {
      expect(r.edge.requires).toBe(r.qid);
      expect(r.toward === "q-ad-treatment" || rungs.some((x) => x.qid === r.toward) || order.includes(r.toward)).toBe(true);
    }
    // 直接先决问题都在台阶上
    for (const p of ix.prereqsOf.get("q-ad-treatment") ?? []) expect(rungs.some((r) => r.qid === p.requires)).toBe(true);
  });

  it("每个问题都能生成导引，台阶不超过上限", () => {
    for (const q of ix.db.questions) {
      const g = guideData(ix, q.id)!;
      expect(g.rungs.length).toBeLessThanOrEqual(MAX_STEPS);
      expect(g.more).toBeGreaterThanOrEqual(0);
      expect(g.terms.length).toBeLessThanOrEqual(8);
    }
  });

  it("各说的推演链与词条来自知识库", () => {
    const g = guideData(ix, "q-ad-treatment")!;
    expect(g.theories.length).toBeGreaterThan(1);
    expect(g.theories.some((t) => t.steps.length > 0)).toBe(true);
    expect(g.terms.map((t) => t.term)).toContain("偶然防卫");
    expect(g.book?.reasons.length).toBeGreaterThan(0);
  });

  it("直觉与推演不一致时，指出第一处分歧的台阶", () => {
    const g = guideData(ix, "q-ad-treatment")!;
    const t = g.theories.find((x) => x.answer)!;
    // 把每级都选成与该学说相反的答案
    const sel: Record<string, string> = {};
    for (const r of g.rungs) {
      const other = r.answers.find((a) => a.id !== (ix.positionOf.get(`${t.id}@${r.qid}`)?.answer ?? ix.theory.get(t.id)!.answer));
      if (other) sel[r.qid] = other.id;
    }
    const d = divergence(ix, g, t.answer!, sel);
    if (d) {
      expect(d.rung).toBeGreaterThan(0);
      expect(d.yours).not.toBe(d.theirs);
    }
  });
});
