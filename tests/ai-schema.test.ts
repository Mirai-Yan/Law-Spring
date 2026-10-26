import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { validateAskResult, validateCaseResult } from "@/lib/ai/schemas";
import { buildIndex } from "@/lib/graph";
import { loadContent } from "@/lib/load";
import { ContentFileSchema } from "@/lib/schema";

const ix = buildIndex(loadContent(path.resolve(__dirname, "../content")).db);

describe("案例分析结果的校验", () => {
  it("丢弃库中不存在的问题 id，并限制数量", () => {
    const r = validateCaseResult(ix, {
      summary: "s",
      issues: [
        { title: "偶然防卫", facts: "f", questionIds: ["q-ad-treatment", "q-not-exist", "q-ad-treatment"] },
        ...Array.from({ length: 8 }, (_, i) => ({ title: `争点${i}`, questionIds: [] })),
      ],
    });
    expect(r.issues).toHaveLength(6);
    expect(r.issues[0].questionIds).toEqual(["q-ad-treatment"]);
    expect(r.issues[0].droppedIds).toEqual(["q-not-exist"]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("检测疑似引注", () => {
    const r = validateCaseResult(ix, { issues: [{ title: "x", note: "参见张明楷《刑法学》第 5 页", questionIds: [] }] });
    expect(r.warnings.some((w) => w.includes("引注"))).toBe(true);
  });

  it("结构不对时报错", () => {
    expect(() => validateCaseResult(ix, "not an object")).toThrow();
  });

  it("内置示例案情引用的问题都存在", () => {
    const demo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../content/_demo/cases.json"), "utf8"));
    for (const c of demo.cases.filter((x: { sample?: boolean }) => !x.sample)) {
      const r = validateCaseResult(ix, c.result);
      expect(r.issues.flatMap((i) => i.droppedIds)).toEqual([]);
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("自由提问结果的校验", () => {
  const raw = {
    matches: ["q-ad-treatment", "q-bogus"],
    draft: {
      text: "见危不救是否应当入罪？",
      level: "applied",
      answers: [
        { id: "Yes!", label: "应当入罪" },
        { id: "no", label: "不应入罪" },
      ],
      prerequisites: [
        { requires: "q-cl-omission", kind: "logical", why: "w", branches: [{ answer: "general", leadsTo: "x" }, { answer: "bogus", leadsTo: "y" }] },
        { requires: "q-harm", kind: "weird-kind", why: "w2" },
        { requires: "q-nowhere", kind: "logical", why: "w3" },
      ],
    },
  };

  it("只保留库内的问题与先决边，修正非法字段", () => {
    const r = validateAskResult(ix, raw, "见危不救该不该入罪");
    expect(r.matches).toEqual(["q-ad-treatment"]);
    expect(r.droppedIds).toEqual(["q-bogus"]);
    const d = r.draft!;
    expect(d.question.origin).toBe("ai");
    expect(d.question.status).toBe("draft");
    expect(d.question.answers.map((a) => a.id)).toEqual(["yes", "no"]);
    expect(d.prerequisites.map((p) => p.requires)).toEqual(["q-cl-omission", "q-harm"]);
    expect(d.prerequisites[0].branches.map((b) => b.answer)).toEqual(["general"]);
    expect(d.prerequisites[1].kind).toBe("logical");
    expect(d.droppedRequires).toEqual(["q-nowhere"]);
    expect(d.findings.filter((f) => f.level === "error")).toEqual([]);
  });

  it("导出的 YAML 符合内容格式", () => {
    const d = validateAskResult(ix, raw, "q").draft!;
    expect(ContentFileSchema.safeParse(yaml.load(d.yaml)).success).toBe(true);
  });

  it("无法挂到库内问题时放弃草稿", () => {
    const r = validateAskResult(ix, { matches: [], draft: { text: "t", answers: [{ id: "a", label: "A" }], prerequisites: [] } }, "q");
    expect(r.draft).toBeNull();
  });
});
