import { describe, expect, it } from "vitest";
import {
  applyTheory,
  buildIndex,
  compatibility,
  findCycles,
  learningOrder,
  nearestFoundations,
  parseWikiLinks,
  prereqTree,
  sameRootQuestions,
  traceToOrigin,
} from "@/lib/graph";
import { validateDb } from "@/lib/validate";
import { emptyDb, type Db, type Prerequisite, type Question } from "@/lib/schema";

const q = (id: string, level: Question["level"], answers = ["a", "b"]): Question => ({
  id,
  concept: "c",
  text: id,
  aliases: [],
  level,
  domain: "criminal",
  answers: answers.map((a) => ({ id: a, label: a })),
  status: "draft",
  sources: [],
});

const e = (question: string, requires: string, branches: Prerequisite["branches"] = []): Prerequisite => ({
  question,
  requires,
  kind: "logical",
  why: "",
  branches,
  status: "draft",
  sources: [],
});

/**
 *   F1 ──► F2 ──► M1 ──► A1
 *           └───► M2 ──► A1
 *                  └───► A2
 *   （箭头：先决 → 下游）
 */
function fixture(): Db {
  const db = emptyDb();
  db.jurisdictions.push({ id: "x", name: "x", short: "x", tradition: "civil", order: 0 });
  db.concepts.push({
    id: "c",
    name: "c",
    original: {},
    kind: "foundation",
    area: "unrecht",
    domain: "criminal",
    tradition: "civil",
    status: "draft",
    sources: [],
  });
  db.questions.push(
    q("F1", "foundation"),
    q("F2", "foundation"),
    q("M1", "intermediate"),
    q("M2", "intermediate"),
    q("A1", "applied"),
    q("A2", "applied"),
  );
  db.prerequisites.push(e("F2", "F1"), e("M1", "F2"), e("M2", "F2"), e("A1", "M1"), e("A1", "M2"), e("A2", "M2"));
  db.theories.push(
    {
      id: "T",
      name: "T",
      original: {},
      question: "F2",
      answer: "a",
      thesis: "",
      proponents: [],
      jurisdictions: [],
      domain: "criminal",
      status: "draft",
      sources: [],
    },
    {
      id: "U",
      name: "U",
      original: {},
      question: "F2",
      answer: "b",
      thesis: "",
      proponents: [],
      jurisdictions: [],
      domain: "criminal",
      status: "draft",
      sources: [],
    },
  );
  db.positions.push(
    { theory: "T", question: "M1", answer: "a", derivation: [], scholars: [], alternatives: [], status: "draft", sources: [] },
    { theory: "U", question: "M1", answer: "b", derivation: [], scholars: [], alternatives: [], status: "draft", sources: [] },
  );
  db.events.push({
    id: "o",
    year: 1900,
    jurisdiction: "x",
    type: "origin",
    title: "o",
    concepts: ["c"],
    scholars: [],
    works: [],
    derivedFrom: [],
    originOf: "c",
    originType: "term",
    status: "draft",
    sources: [],
  });
  return db;
}

describe("先决关系", () => {
  it("检测环路", () => {
    expect(findCycles([e("A", "B"), e("B", "C")])).toEqual([]);
    const cycles = findCycles([e("A", "B"), e("B", "C"), e("C", "A")]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0][0]).toBe(cycles[0][cycles[0].length - 1]);
  });

  it("validator 对成环报错", () => {
    const db = fixture();
    db.prerequisites.push(e("F1", "A1"));
    const errs = validateDb(db).filter((f) => f.level === "error");
    expect(errs.some((f) => f.message.includes("成环"))).toBe(true);
  });

  it("先决树中重复节点只展开一次", () => {
    const ix = buildIndex(fixture());
    const tree = prereqTree(ix, "A1");
    expect(tree.children.map((c) => c.question)).toEqual(["M1", "M2"]);
    const m2 = tree.children[1];
    expect(m2.children[0].question).toBe("F2");
    expect(m2.children[0].repeated).toBe(true);
  });

  it("学习顺序：根据论在前，且尊重先决关系", () => {
    const ix = buildIndex(fixture());
    const order = learningOrder(ix, "A1");
    expect(order).toEqual(["F1", "F2", "M1", "M2", "A1"]);
  });

  it("最近根据论与同根问题", () => {
    const ix = buildIndex(fixture());
    expect(nearestFoundations(ix, "A1")).toEqual(["F2"]);
    expect(nearestFoundations(ix, "F2")).toEqual(["F1"]);
    const groups = sameRootQuestions(ix, "M1");
    // M2 与 M1 同以 F2 为根；A1 是 M1 的下游，排除；A2 经由 M2 也以 F2 为根
    expect(groups).toEqual([{ root: "F2", questions: ["A2", "M2"] }]);
  });
});

describe("分岔推演", () => {
  it("计算学说相容性并套用学说", () => {
    const ix = buildIndex(fixture());
    const sel = { F2: "a", M1: "a" };
    const comp = compatibility(ix, sel);
    expect(comp[0].theory.id).toBe("T");
    expect(comp[0].conflicts).toEqual([]);
    expect(comp.find((c) => c.theory.id === "U")).toBeUndefined();
    expect(applyTheory(ix, "U", ["F2", "M1", "A1"])).toEqual({ F2: "b", M1: "b" });
  });
});

describe("演化回溯", () => {
  it("沿 derivedFrom 找到奇点", () => {
    const events = [
      { id: "now", derivedFrom: ["mid", "side"] },
      { id: "side", derivedFrom: [] },
      { id: "mid", derivedFrom: ["root"] },
      { id: "root", derivedFrom: [], originOf: "c" },
    ];
    expect(traceToOrigin(events, "now", "c")).toEqual(["now", "mid", "root"]);
  });
});

describe("wiki 链接", () => {
  it("解析与校验", () => {
    expect(parseWikiLinks("见 [[scholar:welzel]] 与 [[concept:x|某概念]]")).toEqual([
      { kind: "scholar", id: "welzel", label: undefined },
      { kind: "concept", id: "x", label: "某概念" },
    ]);
    const db = fixture();
    db.concepts[0].summary = "参见 [[scholar:nobody]]";
    expect(validateDb(db).some((f) => f.message.includes("wiki 链接失效"))).toBe(true);
  });
});

describe("fixture 本身合法", () => {
  it("没有错误", () => {
    expect(validateDb(fixture()).filter((f) => f.level === "error")).toEqual([]);
  });
});
