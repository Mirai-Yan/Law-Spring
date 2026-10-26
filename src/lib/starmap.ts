/**
 * 繁星图的数据：每个概念是一颗星，星球大小表示「上位程度」，连线上的光点从上位概念流向下位概念。
 * 只做纯计算，不依赖浏览器，便于测试。
 */
import { descendants, type Index } from "./graph";
import { AREA_LABEL, AREA_ORDER, type Area, type RelationType } from "./schema";

/** 星座分三组上色（三色在夜空底色上两两可分，已校验）；各体系位置靠星座位置与名称区分 */
export type StarGroup = "base" | "theory" | "sanction";
export const STAR_GROUP_OF: Record<Area, StarGroup> = {
  foundations: "base",
  system: "base",
  tatbestand: "theory",
  mens: "theory",
  unrecht: "theory",
  schuld: "theory",
  stages: "theory",
  participation: "theory",
  sanctions: "sanction",
  special: "sanction",
  "sp-public": "sanction",
  "sp-economy": "sanction",
  "sp-person": "sanction",
  "sp-property": "sanction",
  "sp-order": "sanction",
  "sp-duty": "sanction",
};
export const STAR_GROUP_LABEL: Record<StarGroup, string> = {
  base: "基础论与犯罪论体系",
  theory: "犯罪论各阶层",
  sanction: "刑罚论与分论",
};
export const STAR_GROUP_COLOR: Record<StarGroup, string> = {
  base: "#d95926",
  theory: "#3987e5",
  sanction: "#199e70",
};

export type StarLinkType = RelationType | "prereq";

export type StarNode = {
  id: string;
  label: string;
  area: Area;
  group: StarGroup;
  tradition: "civil" | "common" | "both";
  foundation: boolean;
  /** 依赖本概念的问题数（经先决关系传递） */
  dependents: number;
  /** 经属种、构成、派生关系挂在本概念之下的概念数（传递） */
  lower: number;
  score: number;
  /** 星球半径（图坐标） */
  r: number;
  summary?: string;
};

export type StarLink = {
  source: string;
  target: string;
  type: StarLinkType;
  /** down：光从 source（上位）流向 target（下位）；both：双向 */
  flow: "down" | "both";
  weight: number;
  description?: string;
};

/** 这三类关系里 from 是下位、to 是上位 */
const UPWARD: ReadonlySet<RelationType> = new Set(["is_a", "part_of", "derived_from"]);
const BIDIRECTIONAL: ReadonlySet<StarLinkType> = new Set(["symmetric", "functional_equivalent", "opposes"]);

export function starRadius(score: number): number {
  return Math.min(18, 2.6 + Math.sqrt(score) * 1.55);
}

export function starGraph(ix: Index): { nodes: StarNode[]; links: StarLink[] } {
  const qidsOf = (cid: string) => (ix.questionsOfConcept.get(cid) ?? []).map((q) => q.id);

  // 下位概念：沿 from→to（下位→上位）的反方向传递收集
  const lowerOf = new Map<string, Set<string>>();
  for (const r of ix.db.relations) {
    if (!UPWARD.has(r.type)) continue;
    const s = lowerOf.get(r.to) ?? new Set<string>();
    s.add(r.from);
    lowerOf.set(r.to, s);
  }
  const allLower = (cid: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [cid];
    while (stack.length) {
      for (const c of lowerOf.get(stack.pop()!) ?? []) {
        if (!seen.has(c) && c !== cid) {
          seen.add(c);
          stack.push(c);
        }
      }
    }
    return seen;
  };

  const nodes: StarNode[] = ix.db.concepts.map((c) => {
    const own = new Set(qidsOf(c.id));
    const deps = new Set<string>();
    for (const q of own) for (const d of descendants(ix, q)) if (!own.has(d)) deps.add(d);
    const lower = allLower(c.id).size;
    const foundation = c.kind === "foundation";
    const score = deps.size + lower * 2 + (foundation ? 5 : 0);
    return {
      id: c.id,
      label: c.name,
      area: c.area,
      group: STAR_GROUP_OF[c.area],
      tradition: c.tradition,
      foundation,
      dependents: deps.size,
      lower,
      score,
      r: starRadius(score),
      summary: c.summary,
    };
  });

  const links: StarLink[] = [];
  const seen = new Set<string>();
  const push = (l: StarLink) => {
    const k = `${l.type}:${l.source}>${l.target}`;
    if (seen.has(k) || l.source === l.target) return;
    seen.add(k);
    links.push(l);
  };
  for (const r of ix.db.relations) {
    // 光从上位流向下位：上位在 to 的关系要反过来
    const [source, target] = UPWARD.has(r.type) ? [r.to, r.from] : [r.from, r.to];
    push({ source, target, type: r.type, flow: BIDIRECTIONAL.has(r.type) ? "both" : "down", weight: 1, description: r.description });
  }
  // 问题层的先决关系汇总到概念层：先决概念 → 依赖它的概念
  const agg = new Map<string, number>();
  for (const p of ix.db.prerequisites) {
    const a = ix.question.get(p.requires)?.concept;
    const b = ix.question.get(p.question)?.concept;
    if (!a || !b || a === b) continue;
    agg.set(`${a}>${b}`, (agg.get(`${a}>${b}`) ?? 0) + 1);
  }
  for (const [k, n] of agg) {
    const [source, target] = k.split(">");
    push({ source, target, type: "prereq", flow: "down", weight: n, description: `${n} 条问题层先决关系` });
  }

  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, links: links.filter((l) => ids.has(l.source) && ids.has(l.target)) };
}

/** 各星座（体系位置）的中心：基础论居中，其余按体系顺序绕成一圈 */
export function constellationCenters(areas: Area[], radius = 420): Map<Area, { x: number; y: number }> {
  const m = new Map<Area, { x: number; y: number }>();
  const ring = AREA_ORDER.filter((a) => areas.includes(a) && a !== "foundations");
  if (areas.includes("foundations")) m.set("foundations", { x: 0, y: 0 });
  ring.forEach((a, i) => {
    const t = -Math.PI / 2 + (i / ring.length) * Math.PI * 2;
    m.set(a, { x: Math.cos(t) * radius * 1.25, y: Math.sin(t) * radius });
  });
  return m;
}

export const CONSTELLATION_LABEL = AREA_LABEL;
