import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex, prereqTree } from "../src/lib/graph";
import { loadContent } from "../src/lib/load";
import { layoutRootTree, seeded, strandWidth, taperedStrand } from "../src/lib/roottree";

const ix = buildIndex(loadContent(path.resolve("content")).db);

describe("根系图布局", () => {
  const tree = prereqTree(ix, "q-ad-treatment");
  const lay = layoutRootTree(tree);
  const byKey = new Map(lay.nodes.map((n) => [n.key, n]));

  it("每个节点的 key 唯一，根节点就是本题", () => {
    expect(new Set(lay.nodes.map((n) => n.key)).size).toBe(lay.nodes.length);
    expect(lay.root.qid).toBe("q-ad-treatment");
    expect(lay.root.depth).toBe(0);
  });

  it("先决问题都排在它下游问题的下方", () => {
    for (const n of lay.nodes.slice(1)) {
      const p = byKey.get(n.parentKey!)!;
      expect(n.y).toBeGreaterThan(p.y + p.h);
    }
  });

  it("同一层的卡片左右不重叠，也都在画布之内", () => {
    const rows = new Map<number, typeof lay.nodes>();
    for (const n of lay.nodes) rows.set(n.depth, [...(rows.get(n.depth) ?? []), n]);
    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].x - sorted[i].w / 2).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w / 2);
    }
    for (const n of lay.nodes) {
      expect(n.x - n.w / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w / 2).toBeLessThanOrEqual(lay.width);
    }
  });

  it("折叠一个节点后，它下面的问题不再出现", () => {
    const target = lay.nodes.find((n) => n.depth === 1 && n.hasChildren)!;
    const folded = layoutRootTree(tree, { collapsed: new Set([target.key]) });
    expect(folded.nodes.some((n) => n.key.startsWith(target.key + ">"))).toBe(false);
    expect(folded.nodes.find((n) => n.key === target.key)?.collapsed).toBe(true);
  });

  it("测量到的卡片高度会改变下面各层的位置", () => {
    const tall = layoutRootTree(tree, { heights: new Map([[lay.root.key, 300]]) });
    const child = lay.nodes.find((n) => n.depth === 1)!;
    expect(tall.nodes.find((n) => n.key === child.key)!.y).toBeGreaterThan(child.y + 150);
  });

  it("根须越往下牵连越多越粗，路径闭合；细须的随机数可复现", () => {
    expect(strandWidth(9)).toBeGreaterThan(strandWidth(1));
    expect(taperedStrand(0, 0, 10, 50, 8, 4)).toMatch(/^M.*Z$/);
    const a = seeded("x");
    const b = seeded("x");
    expect([a(), a()]).toEqual([b(), b()]);
  });
});
