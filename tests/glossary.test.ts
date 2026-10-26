import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildTermMatcher, splitTerms, termsIn, termsOfQuestion } from "@/lib/glossary";
import { buildIndex } from "@/lib/graph";
import { loadContent } from "@/lib/load";
import { TermSchema, type Term } from "@/lib/schema";

const term = (o: Partial<Term> & { id: string; term: string }): Term =>
  TermSchema.parse({ short: "s", definition: "d", ...o });

describe("基础词条的识别", () => {
  const m = buildTermMatcher([
    term({ id: "a", term: "故意", notIn: ["故意杀人"] }),
    term({ id: "b", term: "间接故意" }),
    term({ id: "c", term: "结果无价值", aliases: ["结果无价值论"] }),
  ]);

  it("最长匹配优先，别名也能识别", () => {
    const pieces = splitTerms("间接故意与结果无价值论", m);
    expect(pieces.filter((p) => typeof p !== "string").map((p) => (p as { term: Term }).term.id)).toEqual(["b", "c"]);
    expect(pieces.map((p) => (typeof p === "string" ? p : p.text)).join("")).toBe("间接故意与结果无价值论");
  });

  it("排除词组整体跳过，不给其中的词加下划线", () => {
    expect(termsIn("故意杀人罪与故意伤害", m)).toEqual(["a"]);
    expect(termsIn("故意杀人罪", m)).toEqual([]);
  });

  it("wiki 链接内部不识别", () => {
    expect(termsIn("见 [[concept:intent|故意]] 一节", m)).toEqual([]);
  });

  it("问题页的词条来自本题材料，数量有上限", () => {
    const ix = buildIndex(loadContent(path.resolve(__dirname, "../content")).db);
    const ids = termsOfQuestion(ix, "q-ad-treatment");
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(8);
    for (const id of ids) expect(ix.term.has(id)).toBe(true);
  });
});
