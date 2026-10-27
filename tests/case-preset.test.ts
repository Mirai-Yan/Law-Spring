import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadDemoCases, presetCaseBrief, presetCaseResult } from "@/lib/ai/analyze";
import { buildIndex } from "@/lib/graph";
import { loadContent } from "@/lib/load";

// 预置结果是没有访问口令的访客唯一能看到的分析：只对内置示例返回，不调用大模型
const ix = buildIndex(loadContent(path.resolve(__dirname, "../content")).db);
const demos = loadDemoCases();

describe("内置示例的预置结果", () => {
  it("有预置分析结果的示例返回 demo 结果，空白差异不影响匹配", () => {
    const d = demos.find((x) => x.result)!;
    const out = presetCaseResult(ix, ` ${d.text.replace(/。/g, "。\n")} `);
    expect(out?.source).toBe("demo");
    expect(out?.result.issues.length).toBeGreaterThan(0);
  });

  it("用户自己写的案情没有预置结果", () => {
    expect(presetCaseResult(ix, "甲在商场捡到一部手机，第二天才交给保安。")).toBeNull();
  });

  it("口语化示例只有第一轮整理有预置结果", () => {
    const d = demos.find((x) => x.brief)!;
    expect(presetCaseBrief(d.text, [])?.source).toBe("demo");
    expect(presetCaseBrief(d.text, [{ role: "user", content: "确认" }])).toBeNull();
  });
});
