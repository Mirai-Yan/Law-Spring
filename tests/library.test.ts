import { beforeEach, describe, expect, it } from "vitest";
import { checkAnswer } from "../src/lib/ai/library";
import { createUser } from "../src/lib/auth";
import { openMemoryDb, useDb } from "../src/lib/db";
import { ExtractError, extractDocument, kindOf, paginate } from "../src/lib/ingest/extract";
import {
  addCard,
  addDocument,
  deleteCard,
  deleteDocument,
  getPage,
  listCards,
  listDocuments,
  searchLibrary,
  searchTerms,
  updateCard,
  type Passage,
} from "../src/lib/library";

beforeEach(() => useDb(openMemoryDb()));

function user(name: string) {
  const u = createUser(name, "password-123");
  if (u === "taken") throw new Error();
  return u.id;
}

describe("上传文件的文字抽取", () => {
  it("按扩展名识别类型", () => {
    expect(kindOf("论文.PDF")).toBe("pdf");
    expect(kindOf("a.docx")).toBe("docx");
    expect(kindOf("a.md")).toBe("md");
    expect(kindOf("a.doc")).toBeNull();
  });

  it("长文按段落切成约 1500 字一页，不丢字", () => {
    const paras = Array.from({ length: 12 }, (_, i) => `第${i + 1}段。` + "占有".repeat(150));
    const pages = paginate(paras.join("\n\n"));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.length <= 1600)).toBe(true);
    expect(pages.join("").replace(/\s/g, "")).toBe(paras.join("").replace(/\s/g, ""));
  });

  it("超长段落按句子再切", () => {
    const pages = paginate("处分意识必要说。".repeat(600));
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((p) => p.length <= 1600)).toBe(true);
  });

  it("把 PDF 字体里的部首码位换回正常汉字", () => {
    expect(paginate("第⼆⻚：受骗⼈⻅到⻔⼝")).toEqual(["第二页：受骗人见到门口"]);
  });

  it("纯文本可以抽取；不支持的格式和空文件报错", async () => {
    const r = await extractDocument(Buffer.from("三角诈骗\n\n被骗人与被害人不是同一人。"), "笔记.txt");
    expect(r.kind).toBe("txt");
    expect(r.pages.join("")).toContain("三角诈骗");
    await expect(extractDocument(Buffer.from("x"), "a.doc")).rejects.toBeInstanceOf(ExtractError);
    await expect(extractDocument(Buffer.from("   \n\n "), "a.txt")).rejects.toThrow(/没有/);
    await expect(extractDocument(Buffer.from("not a pdf"), "a.pdf")).rejects.toThrow(/PDF/);
  });
});

describe("个人资料库", () => {
  it("把问句拆成检索词", () => {
    expect(searchTerms("处分意识 三角诈骗")).toEqual(["处分意识", "三角诈骗"]);
    expect(searchTerms("我的资料怎么讨论处分意识？")).toEqual(["处分意识"]);
    const t = searchTerms("诈骗罪中的处分意识是否必要？");
    expect(t).toEqual(expect.arrayContaining(["诈骗罪", "处分意", "分意识", "必要"]));
    expect(t).not.toContain("是否");
    expect(searchTerms("刑".repeat(300)).length).toBeLessThanOrEqual(24);
  });

  it("全文检索只返回本人的资料；短词退回逐字匹配", () => {
    const a = user("alice");
    const b = user("bob");
    const d1 = addDocument(a, "诈骗罪论文", "f.pdf", "pdf", ["引言", "处分意识必要说认为，被骗人必须认识到其转移了财物的占有。", "盗窃与诈骗的界分"]);
    addDocument(b, "别人的书", "g.pdf", "pdf", ["处分意识不要说"]);
    const hits = searchLibrary(a, "处分意识");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ docId: d1, page: 2, title: "诈骗罪论文" });
    expect(hits[0].snippet).toContain("«处分意识»");
    expect(searchLibrary(a, "盗窃")[0]).toMatchObject({ page: 3 });
    expect(searchLibrary(a, "我的资料怎么讨论被骗人必须认识到什么？")[0]).toMatchObject({ page: 2 });
    expect(searchLibrary(b, "盗窃")).toHaveLength(0);
    expect(getPage(b, d1, 2)).toBeNull();
    expect(getPage(a, d1, 2)).toContain("被骗人");
  });

  it("删除资料时同时删除全文索引和卡片", () => {
    const a = user("alice");
    const d = addDocument(a, "笔记", "n.txt", "txt", ["承继的共犯"]);
    addCard(a, d, 1, "承继的共犯", null, null);
    expect(deleteDocument(user("mallory"), d)).toBe(false);
    expect(deleteDocument(a, d)).toBe(true);
    expect(listDocuments(a)).toHaveLength(0);
    expect(searchLibrary(a, "承继的共犯")).toHaveLength(0);
    expect(listCards(a)).toHaveLength(0);
  });

  it("卡片：只能摘录自己的资料，可以批注、关联问题、删除", () => {
    const a = user("alice");
    const b = user("bob");
    const d = addDocument(a, "论文", "p.pdf", "pdf", ["一", "二"]);
    expect(addCard(b, d, 1, "偷看", null, null)).toBeNull();
    const id = addCard(a, d, 2, "摘录的一段", "我的批注", "q-fraud-disposal-awareness")!;
    expect(listCards(a, { question: "q-fraud-disposal-awareness" })[0]).toMatchObject({ id, page: 2, title: "论文", note: "我的批注" });
    expect(updateCard(b, id, "改", null)).toBe(false);
    expect(updateCard(a, id, null, null)).toBe(true);
    expect(listCards(a, { docId: d })[0]).toMatchObject({ note: null, question: null });
    expect(deleteCard(b, id)).toBe(false);
    expect(deleteCard(a, id)).toBe(true);
    expect(listCards(a)).toHaveLength(0);
  });
});

describe("「只在我的资料里问」的编号核对", () => {
  const ps: Passage[] = [
    { docId: 1, title: "诈骗罪论文", page: 2, snippet: "" },
    { docId: 1, title: "诈骗罪论文", page: 5, snippet: "" },
  ];

  it("删除不存在的段落编号并提示", () => {
    const r = checkAnswer({ answer: "必要说是通说[1]，也有反对意见[2][7]。" }, ps);
    expect(r.used).toEqual([1, 2]);
    expect(r.answer).not.toContain("[7]");
    expect(r.warnings.join()).toMatch(/1 处/);
  });

  it("没有标注依据、引用资料以外的文献都提示", () => {
    expect(checkAnswer({ answer: "处分意识是必要的。" }, ps).warnings.join()).toMatch(/没有标注/);
    expect(checkAnswer({ answer: "见《刑法各论》[1]。" }, ps).warnings.join()).toMatch(/资料以外/);
    expect(checkAnswer({ answer: "见《诈骗罪论文》[1]。" }, ps).warnings).toHaveLength(0);
    expect(checkAnswer(null, ps)).toMatchObject({ answer: "", used: [] });
  });
});
