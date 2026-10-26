import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTutorPage, tutorContext, validateTutorResult } from "@/lib/ai/tutor";
import { buildIndex } from "@/lib/graph";
import { loadContent } from "@/lib/load";

const ix = buildIndex(loadContent(path.resolve(__dirname, "../content")).db);

describe("AI 助教", () => {
  it("问题页的上下文包含答案、先决理由与推演链，不含页码与私有锚点", () => {
    const ctx = tutorContext(ix, { kind: "question", id: "q-ad-treatment" })!;
    const q = ix.question.get("q-ad-treatment")!;
    expect(ctx.title).toBe(q.text);
    for (const a of q.answers) expect(ctx.text).toContain(a.label);
    expect(ctx.text).toContain("先决问题");
    expect(ctx.text).toContain("推演");
    expect(ctx.text).not.toMatch(/第\s*\d+\s*页|p\.\s*\d+/);
    const anchorFile = path.resolve(__dirname, "../content/_private/anchors.yaml");
    if (fs.existsSync(anchorFile)) {
      // 抽查几条锚点原文，确认没有混进上下文
      const texts = [...fs.readFileSync(anchorFile, "utf8").matchAll(/text: (.+)/g)].slice(0, 40).map((m) => m[1].trim());
      for (const t of texts) expect(ctx.text.includes(t)).toBe(false);
    }
  });

  it("专题与罪名页也有上下文；未知页面没有", () => {
    expect(tutorContext(ix, { kind: "concept", id: "self-defense" })?.text).toContain("本专题的问题");
    const crime = ix.db.crimes[0];
    expect(tutorContext(ix, { kind: "crime", id: crime.id })?.title).toBe(crime.name);
    expect(tutorContext(ix, { kind: "question", id: "nope" })).toBeNull();
    expect(parseTutorPage({ kind: "scholar", id: "x" })).toBeUndefined();
  });

  it("引用的 id 逐一对照知识库，库里没有的丢弃；疑似引注给出警告", () => {
    const r = validateTutorResult(ix, {
      answer: "据《某书》第 12 页……",
      refs: ["q-ad-treatment", "self-defense", "t-intent", "q-not-exist"],
      followups: ["一", "二", "三", "四"],
    });
    expect(r.refs.map((x) => x.kind)).toEqual(["question", "concept", "term"]);
    expect(r.followups).toHaveLength(3);
    expect(r.warnings.length).toBe(1);
    expect(() => validateTutorResult(ix, { answer: "" })).toThrow();
  });
});
