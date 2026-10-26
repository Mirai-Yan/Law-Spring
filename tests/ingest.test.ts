import { describe, expect, it } from "vitest";
import { anchorFound, canonical, headerPageNumber, normalizeCjk, parsePages, smoothPageNumbers } from "../src/lib/ingest/text";

describe("OCR 清洗", () => {
  it("删掉中文字之间的空格，保留英文单词之间的空格", () => {
    expect(normalizeCjk("罪 刑 法 定 原 则 ， 是 Rule of Law 的 体 现")).toBe("罪刑法定原则，是 Rule of Law 的体现");
    expect(normalizeCjk("第一行\n\n\n\n第 二 行")).toBe("第一行\n\n第二行");
  });

  it("从页眉识别印刷页码，含被 OCR 拆开的数字", () => {
    expect(headerPageNumber("第一章刑法概说         31\n正文")).toBe(31);
    expect(headerPageNumber("32    刑法学（第七版）\n正文")).toBe(32);
    expect(headerPageNumber("第七章 犯罪的特殊形态 53 7\n正文")).toBe(537);
    expect(headerPageNumber("没有页眉的一页\n正文")).toBeUndefined();
  });

  it("按众数偏移补全识别失败或读错的页码", () => {
    // 第 3 页识别失败，第 5 页读错（应为 35）
    expect(smoothPageNumbers([31, 32, undefined, 34, 99, 36])).toEqual([31, 32, 33, 34, 35, 36]);
  });
});

describe("原文锚点", () => {
  const page = "本书认为，构成要件是违法类型，其内容是说明行为对法益的侵犯性的客观要素。";
  it("忽略空格和全角半角标点的差别", () => {
    expect(anchorFound("构成要件是违法类型, 其内容", page)).toBe(true);
    expect(canonical("（客观）")).toBe(canonical("(客观)"));
  });
  it("找不到的锚点报告为假", () => {
    expect(anchorFound("构成要件是责任类型", page)).toBe(false);
    expect(anchorFound("", page)).toBe(false);
  });
  it("允许句子跨到下一页", () => {
    expect(anchorFound("客观要素。下一页开头", page, "下一页开头的文字")).toBe(true);
  });
  it("解析页码范围", () => {
    expect(parsePages("p. 171")).toEqual({ from: 171, to: 171 });
    expect(parsePages("171–173")).toEqual({ from: 171, to: 173 });
    expect(parsePages("无")).toBeUndefined();
  });
});

import { checkAnchors } from "../src/lib/ingest/anchors";
import { emptyDb } from "../src/lib/schema";

describe("原文锚点核对", () => {
  const db = emptyDb();
  db.bookViews.push({
    id: "bv1",
    work: "w",
    question: "q",
    pages: "10",
    answer: null,
    summary: "",
    reasons: [],
    reported: [{ label: "某说", answer: null, scholars: [], summary: "", pages: "12" }],
    status: "draft",
    sources: [],
  });
  db.bookViews.push({ ...db.bookViews[0], id: "bv2", reported: [] });
  const pages = new Map([
    [10, "本书坚持结果无价值论，主张偶然防卫行为不成立犯罪。"],
    [12, "二元论的未遂说认为，正当防卫的成立要求防卫意识。"],
  ]);

  it("锚点在所引页码上、页码在声明范围内时通过", () => {
    const probs = checkAnchors(db, [
      { key: "bookViews:bv1", page: 10, text: "主张偶然防卫行为不成立犯罪" },
      { key: "bookViews:bv1#0", page: 12, text: "二元论的未遂说认为" },
      { key: "bookViews:bv2", page: 10, text: "本书坚持结果无价值论" },
    ], pages);
    expect(probs).toEqual([]);
  });

  it("页码超出声明范围、找不到锚点、锚点过长、缺少锚点都会报错", () => {
    const probs = checkAnchors(db, [
      { key: "bookViews:bv1", page: 12, text: "二元论的未遂说认为" },
      { key: "bookViews:bv1#0", page: 12, text: "一元论的既遂说认为" },
      { key: "bookViews:bv1", page: 10, text: "本书坚持结果无价值论，主张偶然防卫行为不成立犯罪。本书坚持结果无价值论" },
    ], pages);
    const msgs = probs.map((p) => p.message).join("\n");
    expect(msgs).toMatch(/不在条目声明的页码/);
    expect(msgs).toMatch(/找不到锚点/);
    expect(msgs).toMatch(/超过 30 字/);
    expect(probs.some((p) => p.key === "bookViews:bv2" && /没有任何原文锚点/.test(p.message))).toBe(true);
  });
});
