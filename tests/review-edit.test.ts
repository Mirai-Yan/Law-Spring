import { describe, expect, it } from "vitest";
import { ReviewEditError, setStatusInYaml } from "../src/lib/review-edit";

const FILE = `# 注释要保留
questions:
  - id: q-a
    concept: c
    text: 问题甲
    level: foundation
    answers:
      - { id: yes, label: 是 }

  - id: q-b
    concept: c
    text: 问题乙
    level: foundation
    answers: [{ id: no, label: 否 }]
    status: draft
    # 条目后的注释
prerequisites:
  - question: q-b
    requires: q-a
    kind: logical
    why: 先回答甲
`;

describe("审核台改写 YAML 的 status", () => {
  it("没有 status 行时补在条目末尾，其余文字不变", () => {
    const out = setStatusInYaml(FILE, "questions", "questions:q-a", "disputed");
    expect(out).toContain("      - { id: yes, label: 是 }\n    status: disputed\n\n  - id: q-b");
    expect(out.replace("    status: disputed\n", "")).toBe(FILE);
  });

  it("已有 status 行时原地替换", () => {
    const out = setStatusInYaml(FILE, "questions", "questions:q-b", "verified");
    expect(out).toContain("    status: verified\n    # 条目后的注释");
    expect(out.split("\n")).toHaveLength(FILE.split("\n").length);
  });

  it("复合键的条目（先决关系）也能定位", () => {
    const out = setStatusInYaml(FILE, "prerequisites", "prerequisites:q-b<-q-a", "verified");
    expect(out.trimEnd().endsWith("why: 先回答甲\n    status: verified")).toBe(true);
  });

  it("找不到条目时报错，不返回内容", () => {
    expect(() => setStatusInYaml(FILE, "questions", "questions:q-x", "verified")).toThrow(ReviewEditError);
    expect(() => setStatusInYaml(FILE, "events", "events:e", "verified")).toThrow(/没有 events/);
  });
});
