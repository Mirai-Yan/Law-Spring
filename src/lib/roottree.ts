/**
 * 根系图的布局：把先决问题树排成「向下生长的根」。
 * 横向位置用 d3-hierarchy 的 tidy tree；纵向按每一层卡片的实际高度累加，
 * 卡片高度由组件渲染后测量传入（未测量时用估计值）。
 */
import { hierarchy, tree } from "d3-hierarchy";
import type { PrereqTreeNode } from "./graph";
import type { Prerequisite } from "./schema";

export type RootNode = {
  /** 在树中的唯一路径，同一问题在 DAG 中出现多次时 key 不同 */
  key: string;
  qid: string;
  parentKey?: string;
  edge?: Prerequisite;
  repeated: boolean;
  depth: number;
  /** 卡片中心的横坐标、卡片顶部的纵坐标 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 子树（含自身）中的叶子数，用来决定根须粗细 */
  leaves: number;
  hasChildren: boolean;
  collapsed: boolean;
};

export type RootLayout = { nodes: RootNode[]; width: number; height: number; root: RootNode };

export type LayoutOptions = {
  collapsed?: ReadonlySet<string>;
  heights?: ReadonlyMap<string, number>;
  /** 相邻卡片之间的最小水平空隙 */
  gapX?: number;
  cardW?: number;
  /** 「已在别处展开」的引用卡片宽度 */
  refW?: number;
  rootW?: number;
  gapY?: number;
  /** 根卡片上方留给树冠的高度 */
  top?: number;
  pad?: number;
};

type Keyed = { key: string; node: PrereqTreeNode; kids: Keyed[] };

function withKeys(n: PrereqTreeNode, parentKey: string): Keyed {
  const key = parentKey ? `${parentKey}>${n.question}` : n.question;
  return { key, node: n, kids: n.children.map((c) => withKeys(c, key)) };
}

export function layoutRootTree(root: PrereqTreeNode, opts: LayoutOptions = {}): RootLayout {
  const { collapsed = new Set(), heights = new Map(), gapX = 22, cardW = 188, refW = 128, rootW = 290, gapY = 64, top = 0, pad = 24 } = opts;

  const h = hierarchy(withKeys(root, ""), (d) => (collapsed.has(d.key) ? null : d.kids));
  h.count();
  const w = (d: { depth: number; data: Keyed }) => (d.depth === 0 ? rootW : d.data.node.repeated ? refW : cardW);
  // nodeSize 取 1，separation 直接返回像素距离：按两张卡片的实际宽度留出空隙
  tree<Keyed>()
    .nodeSize([1, 1])
    .separation((a, b) => (w(a) / 2 + w(b) / 2 + gapX) * (a.parent === b.parent ? 1 : 1.12))(h);

  const all = h.descendants();
  const est = (d: (typeof all)[number]) => (d.depth === 0 ? 92 : d.data.node.repeated ? 52 : 80);
  const rowH: number[] = [];
  for (const d of all) rowH[d.depth] = Math.max(rowH[d.depth] ?? 0, heights.get(d.data.key) ?? est(d));
  const rowY: number[] = [];
  let acc = top + pad;
  for (let i = 0; i < rowH.length; i++) {
    rowY[i] = acc;
    acc += rowH[i] + gapY;
  }

  const widthOf = w;
  const minX = Math.min(...all.map((d) => (d.x ?? 0) - widthOf(d) / 2));
  const maxX = Math.max(...all.map((d) => (d.x ?? 0) + widthOf(d) / 2));
  const shift = pad - minX;

  const nodes: RootNode[] = all.map((d) => ({
    key: d.data.key,
    qid: d.data.node.question,
    parentKey: d.parent?.data.key,
    edge: d.data.node.edge,
    repeated: !!d.data.node.repeated,
    depth: d.depth,
    x: (d.x ?? 0) + shift,
    y: rowY[d.depth],
    w: widthOf(d),
    h: heights.get(d.data.key) ?? est(d),
    leaves: d.value ?? 1,
    hasChildren: d.data.kids.length > 0 && !d.data.node.repeated,
    collapsed: collapsed.has(d.data.key),
  }));

  return {
    nodes,
    width: maxX - minX + pad * 2,
    height: acc - gapY + pad,
    root: nodes[0],
  };
}

/** 根须粗细：按子树叶子数开方，限制在合理范围 */
export function strandWidth(leaves: number): number {
  return Math.min(22, 5 + Math.sqrt(leaves) * 4);
}

/**
 * 一条渐细的根须：从上层卡片底部中点 (x1,y1) 到下层卡片顶部中点 (x2,y2)，
 * 起点宽 w1、终点宽 w2，返回可填充的闭合路径。
 */
export function taperedStrand(x1: number, y1: number, x2: number, y2: number, w1: number, w2: number): string {
  const ym = (y1 + y2) / 2;
  const a = w1 / 2;
  const b = w2 / 2;
  const f = (n: number) => n.toFixed(1);
  return [
    `M${f(x1 - a)},${f(y1)}`,
    `C${f(x1 - a)},${f(ym)} ${f(x2 - b)},${f(ym)} ${f(x2 - b)},${f(y2)}`,
    `L${f(x2 + b)},${f(y2)}`,
    `C${f(x2 + b)},${f(ym)} ${f(x1 + a)},${f(ym)} ${f(x1 + a)},${f(y1)}`,
    "Z",
  ].join(" ");
}

/** 根须的中心线（用于沿线流动的动画），方向从下层指向上层 */
export function strandCenterUp(x1: number, y1: number, x2: number, y2: number): string {
  const ym = (y1 + y2) / 2;
  return `M${x2.toFixed(1)},${y2.toFixed(1)} C${x2.toFixed(1)},${ym.toFixed(1)} ${x1.toFixed(1)},${ym.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

/** 由字符串得到稳定的伪随机数序列，用来生成每条根须上的细须，保证每次渲染一致 */
export function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
