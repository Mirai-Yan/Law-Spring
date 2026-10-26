import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent } from "@/lib/load";
import { validateDb } from "@/lib/validate";
import {
  applyTheory,
  ancestors,
  buildIndex,
  conceptLinks,
  learningOrder,
  sameRootQuestions,
} from "@/lib/graph";

const { db, issues } = loadContent(path.resolve(__dirname, "../content"));
const ix = buildIndex(db);

describe("content/ 的真实内容", () => {
  it("解析无误、校验无错误", () => {
    expect(issues).toEqual([]);
    expect(validateDb(db).filter((f) => f.level === "error")).toEqual([]);
  });

  it("偶然防卫的先决树能追溯到「违法性的本质」", () => {
    const up = ancestors(ix, "q-ad-treatment");
    expect(up.has("q-unrecht-core")).toBe(true);
    expect(up.has("q-attempt-basis")).toBe(true);
  });

  it("学习顺序以根据论开头、以目标问题结尾", () => {
    const order = learningOrder(ix, "q-ad-treatment");
    expect(ix.question.get(order[0])?.level).toBe("foundation");
    expect(order.at(-1)).toBe("q-ad-treatment");
    // 每个问题都排在它的所有先决问题之后
    const pos = new Map(order.map((q, i) => [q, i]));
    for (const p of db.prerequisites)
      if (pos.has(p.question) && pos.has(p.requires))
        expect(pos.get(p.requires)!).toBeLessThan(pos.get(p.question)!);
  });

  it("偶然防卫的挂钩：对称问题是假想防卫，同根问题含不能犯", () => {
    const links = conceptLinks(ix, "accidental-defense", ["symmetric"]);
    expect(links.map((l) => l.other.id)).toContain("putative-defense");
    const same = sameRootQuestions(ix, "q-ad-treatment").flatMap((g) => g.questions);
    expect(same).toContain("q-empty-bed");
  });

  it("套用结果无价值论与二元论，偶然防卫的结论不同", () => {
    const qs = ["q-unrecht-core", "q-ad-intent-required", "q-ad-treatment"];
    const r = applyTheory(ix, "result-disvalue", qs);
    const d = applyTheory(ix, "dual-act-disvalue", qs);
    expect(r["q-ad-treatment"]).toBe("acquit");
    expect(d["q-ad-treatment"]).toBe("attempt");
  });
});
