import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../src/lib/graph";
import { loadContent } from "../src/lib/load";
import { constellationCenters, starGraph, starRadius, STAR_GROUP_OF } from "../src/lib/starmap";
import { AREA_ORDER } from "../src/lib/schema";

const ix = buildIndex(loadContent(path.resolve("content")).db);
const { nodes, links } = starGraph(ix);
const byId = new Map(nodes.map((n) => [n.id, n]));

describe("繁星图数据", () => {
  it("每个概念都是一颗星，连线两端都存在", () => {
    expect(nodes.length).toBe(ix.db.concepts.length);
    for (const l of links) {
      expect(byId.has(l.source)).toBe(true);
      expect(byId.has(l.target)).toBe(true);
    }
  });

  it("星球半径随上位程度单调增大，并有上限", () => {
    expect(starRadius(0)).toBeLessThan(starRadius(10));
    expect(starRadius(10)).toBeLessThan(starRadius(40));
    expect(starRadius(10_000)).toBe(18);
  });

  it("违法性的本质比偶然防卫更上位（更大）", () => {
    expect(byId.get("wrongfulness-essence")!.r).toBeGreaterThan(byId.get("accidental-defense")!.r);
  });

  it("构成、派生、属种关系的光从上位（to）流向下位（from）", () => {
    for (const r of ix.db.relations.filter((r) => ["part_of", "derived_from", "is_a"].includes(r.type))) {
      expect(links.some((l) => l.type === r.type && l.source === r.to && l.target === r.from && l.flow === "down")).toBe(true);
    }
  });

  it("对称、功能对应、对立双向流动", () => {
    for (const l of links) if (["symmetric", "functional_equivalent", "opposes"].includes(l.type)) expect(l.flow).toBe("both");
  });

  it("先决边由问题层汇总：先决概念指向依赖它的概念", () => {
    const p = ix.db.prerequisites.find((p) => ix.question.get(p.requires)!.concept !== ix.question.get(p.question)!.concept)!;
    const a = ix.question.get(p.requires)!.concept;
    const b = ix.question.get(p.question)!.concept;
    const l = links.find((l) => l.type === "prereq" && l.source === a && l.target === b)!;
    expect(l.weight).toBeGreaterThanOrEqual(1);
  });

  it("每个体系位置都有分组颜色和互不重合的星座中心", () => {
    for (const a of AREA_ORDER) expect(STAR_GROUP_OF[a]).toBeDefined();
    const c = constellationCenters([...AREA_ORDER]);
    const keys = new Set([...c.values()].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    expect(keys.size).toBe(AREA_ORDER.length);
  });
});
