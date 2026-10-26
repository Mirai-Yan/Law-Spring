import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { confirmedCaseText, validateCaseBrief } from "@/lib/ai/schemas";

describe("案情整理结果的校验", () => {
  it("限制事实与问题的数量，丢掉选项不足的问题，并编号", () => {
    const b = validateCaseBrief({
      restated: "甲在超市拿了酒。",
      facts: Array.from({ length: 20 }, (_, i) => ({ text: `事实${i}`, source: i % 2 ? "补充" : "原文" })),
      questions: [
        { ask: "问一", why: "因为", options: ["是", "否", "是"] },
        { ask: "只有一个选项", options: ["是"] },
        { ask: "问二", options: ["a", "b", "c", "d", "e"], multi: true },
        { ask: "问三", options: ["a", "b"] },
        { ask: "问四", options: ["a", "b"] },
      ],
      ready: true,
    });
    expect(b.facts).toHaveLength(12);
    expect(b.facts[0]).toEqual({ id: "f1", text: "事实0", source: "原文" });
    expect(b.facts[1].source).toBe("补充");
    expect(b.questions.map((q) => q.ask)).toEqual(["问一", "问二", "问三"]);
    expect(b.questions[0].options).toEqual(["是", "否"]);
    expect(b.questions[1].options).toHaveLength(4);
    expect(b.questions[1].multi).toBe(true);
    // 还有问题时不算整理完毕，即使模型说 ready
    expect(b.ready).toBe(false);
  });

  it("没有问题时才算理解一致", () => {
    expect(validateCaseBrief({ restated: "x", facts: [{ text: "y" }], questions: [], ready: true }).ready).toBe(true);
  });

  it("疑似引注给出警告；缺少复述时报错", () => {
    expect(validateCaseBrief({ restated: "依《刑法学》第 3 页", facts: [] }).warnings.length).toBe(1);
    expect(() => validateCaseBrief({ facts: [] })).toThrow();
  });

  it("确认后的案情按编号列出事实", () => {
    expect(confirmedCaseText({ restated: "复述", facts: [{ text: "一" }, { text: "二" }] })).toBe("以下案情已与用户逐条确认：\n复述\n\n事实要点：\n1. 一\n2. 二");
  });

  it("内置的口语化示例有可用的预置整理结果", () => {
    const demo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../content/_demo/cases.json"), "utf8"));
    const s = demo.cases.find((c: { sample?: boolean }) => c.sample);
    const b = validateCaseBrief(s.brief);
    expect(b.facts.length).toBeGreaterThan(3);
    expect(b.questions.length).toBeGreaterThan(0);
  });
});
