import path from "node:path";
import { describe, expect, it } from "vitest";
import { ancestors, buildIndex, theoryAnswer } from "@/lib/graph";
import { loadContent } from "@/lib/load";
import { allQuizItems, filterQuiz, pickQuiz } from "@/lib/quiz";

const ix = buildIndex(loadContent(path.resolve(__dirname, "../content")).db);
const items = allQuizItems(ix);

describe("练习题生成", () => {
  it("四种题型都能出题", () => {
    for (const k of ["theory-conclusion", "conclusion-theory", "prereq", "scholar-theory"] as const)
      expect(items.filter((i) => i.kind === k).length).toBeGreaterThan(5);
  });

  it("每道题的选项唯一、至少两个、正确答案在选项中", () => {
    for (const it of items) {
      const ids = it.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(ids).toContain(it.correct);
    }
  });

  it("学说 → 结论：正确答案与知识库一致，干扰项不包括阵营内另说", () => {
    for (const it of items.filter((i) => i.kind === "theory-conclusion")) {
      const [, tid, qid] = it.id.split(":");
      const ta = theoryAnswer(ix, tid, qid)!;
      expect(it.correct).toBe(ta.answer);
      const alt = new Set(ta.position!.alternatives.map((a) => a.answer));
      for (const o of it.options) if (o.id !== it.correct) expect(alt.has(o.id)).toBe(false);
    }
  });

  it("结论 → 学说：干扰项学说在该问题上的结论都不同于正确答案", () => {
    for (const it of items.filter((i) => i.kind === "conclusion-theory")) {
      const [, tid, qid] = it.id.split(":");
      const a = theoryAnswer(ix, tid, qid)!.answer;
      for (const o of it.options) {
        if (o.id === it.correct) continue;
        const ta = theoryAnswer(ix, o.id, qid)!;
        expect(ta.answer).not.toBe(a);
        expect(ta.position?.alternatives.some((x) => x.answer === a) ?? false).toBe(false);
      }
    }
  });

  it("先决问题：干扰项都不是该问题的（间接）先决问题", () => {
    for (const it of items.filter((i) => i.kind === "prereq")) {
      const qid = it.id.split(":")[1];
      const up = ancestors(ix, qid);
      for (const o of it.options) if (o.id !== it.correct) expect(up.has(o.id)).toBe(false);
    }
  });

  it("同一种子抽到同一组题；筛选条件生效", () => {
    expect(pickQuiz(items, 10, 42).map((i) => i.id)).toEqual(pickQuiz(items, 10, 42).map((i) => i.id));
    const unrecht = filterQuiz(items, { area: "unrecht" });
    expect(unrecht.length).toBeGreaterThan(0);
    expect(unrecht.every((i) => i.area === "unrecht")).toBe(true);
    expect(filterQuiz(items, { foundation: "q-school" }).every((i) => i.kind !== "prereq")).toBe(true);
  });
});
