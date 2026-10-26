"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { answerLabel, downstream, type Index, type PrereqTreeNode } from "@/lib/graph";
import { layoutRootTree, seeded, strandCenterUp, strandWidth, taperedStrand, type RootNode } from "@/lib/roottree";
import { PREREQ_KIND_LABEL, type PrereqKind } from "@/lib/schema";
import { InlineRich } from "./RichText";
import { KindChip, LevelBadge } from "./ui";
import { IconStar } from "./icons";

const KIND_GLYPH: Record<PrereqKind, string> = { foundational: "◆", logical: "→", systematic: "▤", conceptual: "≡" };
/** 四类先决关系在根须中心线上的线型 */
const KIND_DASH: Record<PrereqKind, string | undefined> = { foundational: undefined, logical: undefined, systematic: "6 4", conceptual: "1.5 3.5" };

const CANOPY_LEAF_W = 148;
const MAX_LEAVES = 6;

type View = { x: number; y: number; k: number };

export default function RootTree({
  ix,
  rootId,
  tree,
  walk,
  selection,
  onToggle,
}: {
  ix: Index;
  rootId: string;
  tree: PrereqTreeNode;
  walk: boolean;
  selection: Record<string, string>;
  onToggle: (qid: string, ans: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const [selected, setSelected] = useState<string>(rootId);
  const [flash, setFlash] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  // ---------- 树冠：依赖本题的下游问题 ----------
  const canopy = useMemo(() => downstream(ix, rootId).direct.map((p) => p.question), [ix, rootId]);
  const shownLeaves = canopy.slice(0, MAX_LEAVES);
  const leafRows = shownLeaves.length > 3 ? 2 : shownLeaves.length > 0 ? 1 : 0;
  const top = leafRows === 0 ? 70 : 56 + leafRows * 58 + 40;

  const layout = useMemo(
    () => layoutRootTree(tree, { collapsed, heights, top }),
    [tree, collapsed, heights, top],
  );
  const root = layout.root;

  // 树冠叶子的位置（以树干为中心左右排开），必要时整体右移、加宽画布
  const leaves = useMemo(() => {
    const perRow = Math.ceil(shownLeaves.length / Math.max(1, leafRows));
    return shownLeaves.map((qid, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, shownLeaves.length - row * perRow);
      const col = i - row * perRow;
      const x = root.x + (col - (inRow - 1) / 2) * (CANOPY_LEAF_W + 14) + (row % 2 ? 40 : 0);
      return { qid, x, y: 24 + row * 58 };
    });
  }, [shownLeaves, leafRows, root.x]);
  const minLeafX = Math.min(Infinity, ...leaves.map((l) => l.x - CANOPY_LEAF_W / 2));
  const maxLeafX = Math.max(-Infinity, ...leaves.map((l) => l.x + CANOPY_LEAF_W / 2));
  const offsetX = Math.max(0, 24 - minLeafX);
  const width = Math.max(layout.width, maxLeafX + 24) + offsetX;
  const height = layout.height;
  const groundY = root.y + Math.min(root.h, 92) / 2;
  const byKey = useMemo(() => new Map(layout.nodes.map((n) => [n.key, n])), [layout.nodes]);
  // 同一张卡片下的几条根，从卡片底部分开长出，而不是挤在同一点
  const startOffsets = useMemo(() => {
    const groups = new Map<string, RootNode[]>();
    for (const n of layout.nodes) if (n.parentKey) groups.set(n.parentKey, [...(groups.get(n.parentKey) ?? []), n]);
    const m = new Map<string, number>();
    for (const [pk, kids] of groups) {
      const parent = byKey.get(pk)!;
      const sorted = [...kids].sort((a, b) => a.x - b.x);
      const spread = Math.min(26, (parent.w * 0.55) / sorted.length);
      sorted.forEach((c, i) => m.set(c.key, (i - (sorted.length - 1) / 2) * spread));
    }
    return m;
  }, [layout.nodes, byKey]);

  // ---------- 测量卡片高度，按实际高度重新排布 ----------
  useLayoutEffect(() => {
    let changed = false;
    const next = new Map(heights);
    for (const [key, el] of cardRefs.current) {
      const h = el.offsetHeight;
      if (h && Math.abs((next.get(key) ?? 0) - h) > 1) {
        next.set(key, h);
        changed = true;
      }
    }
    if (changed) setHeights(next);
    // 卡片高度只会随布局、推演模式和所选答案变化
  }, [layout.nodes, walk, selection, heights]);

  // ---------- 平移与缩放 ----------
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef(false);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    // 窄屏上卡片相对更大，初始缩放可以更小一些
    const k = Math.max(vw < 640 ? 0.62 : 0.78, Math.min(1, vw / width));
    // 放得下就整体居中；放不下也以整棵树居中，两侧各留一点，拖动即可看到
    setView({ x: (vw - width * k) / 2, y: 4, k });
  }, [width]);

  useEffect(() => {
    if (!fitted.current && heights.size > 0) {
      fitted.current = true;
      fit();
    }
  }, [fit, heights.size]);
  useEffect(() => {
    fitted.current = false;
  }, [rootId]);

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const { x, y, k } = viewRef.current;
    const nk = Math.max(0.3, Math.min(2.2, k * factor));
    const cx = px ?? vp.clientWidth / 2;
    const cy = py ?? vp.clientHeight / 2;
    setView({ x: cx - ((cx - x) * nk) / k, y: cy - ((cy - y) * nk) / k, k: nk });
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    // 按住 Ctrl/⌘ 滚动（以及触控板双指捏合）才缩放；普通滚动照常滚动页面
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button,[data-nodrag]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = viewportRef.current!.getBoundingClientRect();
      zoomAt(d / pinch.current.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.current = { d };
      return;
    }
    setView((v) => ({ ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  /** 把某个节点移到视野中间并闪一下 */
  const focusNode = useCallback(
    (key: string) => {
      const n = byKey.get(key);
      const vp = viewportRef.current;
      if (!n || !vp) return;
      const { k } = viewRef.current;
      setView({ k, x: vp.clientWidth / 2 - (n.x + offsetX) * k, y: vp.clientHeight / 3 - (n.y + n.h / 2) * k });
      setSelected(key);
      setFlash(key);
      setTimeout(() => setFlash((f) => (f === key ? null : f)), 2600);
    },
    [byKey, offsetX],
  );

  const firstKeyOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of layout.nodes) if (!n.repeated && !m.has(n.qid)) m.set(n.qid, n.key);
    return m;
  }, [layout.nodes]);

  const toggleCollapse = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const fullscreenRef = useRef<HTMLDivElement>(null);
  const toggleFullscreen = () => {
    const el = fullscreenRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().then(() => setTimeout(fit, 50));
  };

  const sel = byKey.get(selected) ?? root;

  return (
    <div>
      <div ref={fullscreenRef} className="relative overflow-hidden rounded-xl border border-border bg-surface [&:fullscreen]:rounded-none">
        <div
          ref={viewportRef}
          className="relative cursor-grab touch-none select-none active:cursor-grabbing"
          style={{ height: "clamp(420px, 68vh, 760px)" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="group"
          aria-label="先决问题根系图：上方是本题，向下的根是它的先决问题，最深处是根据论"
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
          >
            <svg width={width} height={height} className="absolute left-0 top-0 overflow-visible" aria-hidden>
              <defs>
                <linearGradient id="soil" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--soil-top)" />
                  <stop offset="1" stopColor="var(--soil-bottom)" />
                </linearGradient>
                <linearGradient id="bark" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="var(--root)" />
                  <stop offset="0.45" stopColor="var(--root-hi)" />
                  <stop offset="1" stopColor="var(--root)" />
                </linearGradient>
              </defs>
              <g transform={`translate(${offsetX},0)`}>
                {/* 土壤与地面 */}
                <rect x={-offsetX - 2000} y={groundY} width={width + 4000} height={height - groundY + 2000} fill="url(#soil)" />
                <line x1={-offsetX - 2000} x2={width + 2000} y1={groundY} y2={groundY} stroke="var(--root)" strokeOpacity={0.45} strokeWidth={1.5} />
                <Grass cx={root.x} y={groundY} from={-offsetX} to={width - offsetX} avoid={root.w / 2 + 16} />

                {/* 树干与树冠的枝条 */}
                <Trunk x={root.x} top={top - 34} bottom={root.y + 4} />
                {leaves.map((l) => (
                  <path
                    key={l.qid}
                    d={`M${root.x},${top - 30} C${root.x},${(top - 30 + l.y + 40) / 2} ${l.x},${(top - 30 + l.y + 40) / 2 + 10} ${l.x},${l.y + 40}`}
                    fill="none"
                    stroke="var(--root)"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                ))}
                {leaves.length === 0 && <Sprout x={root.x} y={top - 34} />}

                {/* 根须 */}
                {layout.nodes.slice(1).map((n) => (
                  <Strand
                    key={n.key}
                    parent={byKey.get(n.parentKey!)!}
                    child={n}
                    startDx={startOffsets.get(n.key) ?? 0}
                    lit={walk && !!selection[n.qid] && !n.repeated}
                  />
                ))}
              </g>
            </svg>

            {/* 树冠叶子：依赖本题的问题 */}
            {leaves.map((l) => {
              const q = ix.question.get(l.qid);
              return (
                <Link
                  key={l.qid}
                  href={`/question/${l.qid}/`}
                  title={`以本题为先决：${q?.text ?? ""}`}
                  className="absolute line-clamp-2 rounded-[14px_4px_14px_4px] border px-2.5 py-1.5 text-center text-xs leading-snug text-ink-2 shadow-sm hover:text-ink"
                  style={{
                    left: l.x + offsetX - CANOPY_LEAF_W / 2,
                    top: l.y,
                    width: CANOPY_LEAF_W,
                    background: "var(--leaf-soft)",
                    borderColor: "color-mix(in oklab, var(--leaf) 45%, transparent)",
                  }}
                >
                  {q?.text}
                </Link>
              );
            })}
            {canopy.length > MAX_LEAVES && (
              <div className="absolute text-xs text-ink-3" style={{ left: root.x + offsetX + 30, top: top - 52 }}>
                另有 {canopy.length - MAX_LEAVES} 个问题以本题为先决
              </div>
            )}
            {leaves.length > 0 && (
              <div className="absolute text-[11px] tracking-wider text-ink-3" style={{ left: root.x + offsetX + 22, top: top - 30 }}>
                ↑ 依赖本题的问题
              </div>
            )}

            {/* 卡片 */}
            {layout.nodes.map((n) => (
              <NodeCard
                key={n.key}
                n={n}
                ix={ix}
                offsetX={offsetX}
                isRoot={n.depth === 0}
                walk={walk}
                selection={selection}
                onToggle={onToggle}
                selected={sel.key === n.key}
                flashing={flash === n.key}
                onSelect={() => setSelected(n.key)}
                onCollapse={() => toggleCollapse(n.key)}
                onJump={() => {
                  const k = firstKeyOf.get(n.qid);
                  if (k) focusNode(k);
                }}
                hiddenCount={n.collapsed ? countBelow(tree, n.key) : 0}
                cardRef={(el) => {
                  if (el) cardRefs.current.set(n.key, el);
                  else cardRefs.current.delete(n.key);
                }}
              />
            ))}
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="absolute right-2 top-2 flex gap-1" data-nodrag>
          <button className="btn !px-2 !py-0.5 !text-[13px]" onClick={() => zoomAt(1.2)} aria-label="放大">
            ＋
          </button>
          <button className="btn !px-2 !py-0.5 !text-[13px]" onClick={() => zoomAt(1 / 1.2)} aria-label="缩小">
            －
          </button>
          <button className="btn !px-2 !py-0.5 !text-[13px]" onClick={fit}>
            适配
          </button>
          {collapsed.size > 0 && (
            <button className="btn !px-2 !py-0.5 !text-[13px]" onClick={() => setCollapsed(new Set())}>
              全部展开
            </button>
          )}
          <button className="btn !px-2 !py-0.5 !text-[13px]" onClick={toggleFullscreen}>
            全屏
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-ink-3">
          拖动平移 · 按住 Ctrl/⌘ 滚动缩放 · 点卡片看详情
        </div>
      </div>

      <Legend />
      <NodeDetail ix={ix} n={sel} walk={walk} selection={selection} />
    </div>
  );
}

/** 某个折叠节点下面藏了多少个问题 */
function countBelow(tree: PrereqTreeNode, key: string): number {
  const find = (n: PrereqTreeNode, k: string): PrereqTreeNode | undefined => {
    if (k === key) return n;
    for (const c of n.children) {
      const r = find(c, `${k}>${c.question}`);
      if (r) return r;
    }
  };
  const count = (n: PrereqTreeNode): number => n.children.reduce((a, c) => a + 1 + count(c), 0);
  const hit = find(tree, tree.question);
  return hit ? count(hit) : 0;
}

/* ------------------------------------------------------------------ */

function Strand({ parent, child, startDx, lit }: { parent: RootNode; child: RootNode; startDx: number; lit: boolean }) {
  const x1 = parent.x + startDx;
  const y1 = parent.y + parent.h - 2;
  const x2 = child.x;
  const y2 = child.y + 2;
  const w1 = strandWidth(child.leaves);
  const w2 = Math.max(3, w1 * 0.5);
  const kind = child.edge?.kind ?? "logical";
  const rnd = seeded(child.key);
  // 两三根细须
  const hairs = [0.32, 0.58, 0.8].map((t) => {
    const x = x1 + (x2 - x1) * (t * t * (3 - 2 * t));
    const y = y1 + (y2 - y1) * t;
    const dir = rnd() > 0.5 ? 1 : -1;
    const len = 10 + rnd() * 14;
    return `M${x.toFixed(1)},${y.toFixed(1)} q${(dir * len * 0.6).toFixed(1)},${(len * 0.2).toFixed(1)} ${(dir * len).toFixed(1)},${(len * 0.9).toFixed(1)}`;
  });
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };

  return (
    <g>
      <path d={taperedStrand(x1, y1, x2, y2, w1, w2)} fill="url(#bark)" opacity={child.repeated ? 0.45 : 0.95} />
      {hairs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--root)" strokeWidth={1} strokeLinecap="round" opacity={0.55} />
      ))}
      {KIND_DASH[kind] && (
        <path d={strandCenterUp(x1, y1, x2, y2)} fill="none" stroke="var(--surface)" strokeOpacity={0.75} strokeWidth={1.4} strokeDasharray={KIND_DASH[kind]} />
      )}
      {lit && (
        <>
          <path d={taperedStrand(x1, y1, x2, y2, w1 + 3, w2 + 3)} fill="var(--accent)" opacity={0.28} />
          <path d={strandCenterUp(x1, y1, x2, y2)} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" className="sap-flow" />
        </>
      )}
      <g transform={`translate(${mid.x},${mid.y})`}>
        <title>{`${PREREQ_KIND_LABEL[kind]}${child.edge?.why ? `：${child.edge.why.replace(/\[\[[a-z]+:[^|\]]+\|?([^\]]*)\]\]/g, "$1")}` : ""}`}</title>
        <circle r={9} fill="var(--surface)" stroke="var(--root)" strokeWidth={1.2} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={10} fill="var(--ink-2)">
          {KIND_GLYPH[kind]}
        </text>
      </g>
    </g>
  );
}

function Trunk({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  const t = 9;
  const b = 15;
  const d = `M${x - t},${top} C${x - t},${(top + bottom) / 2} ${x - b},${bottom - 12} ${x - b - 6},${bottom} L${x + b + 6},${bottom} C${x + b},${bottom - 12} ${x + t},${(top + bottom) / 2} ${x + t},${top} Z`;
  return <path d={d} fill="url(#bark)" />;
}

function Sprout({ x, y }: { x: number; y: number }) {
  return (
    <g fill="var(--leaf)" opacity={0.85}>
      <path d={`M${x},${y + 4} C${x - 26},${y - 6} ${x - 34},${y - 22} ${x - 6},${y - 16} C${x - 2},${y - 8} ${x},${y} ${x},${y + 4} Z`} />
      <path d={`M${x},${y + 4} C${x + 26},${y - 10} ${x + 36},${y - 28} ${x + 6},${y - 22} C${x + 2},${y - 12} ${x},${y} ${x},${y + 4} Z`} />
    </g>
  );
}

/** 地面上的几簇草：避开树干下方的卡片 */
function Grass({ cx, y, from, to, avoid }: { cx: number; y: number; from: number; to: number; avoid: number }) {
  const rnd = seeded("grass" + Math.round(cx));
  const blades: string[] = [];
  for (let x0 = from + 30; x0 < to - 20; x0 += 70 + rnd() * 60) {
    if (Math.abs(x0 - cx) < avoid) continue;
    for (const lean of [-1, 0, 1]) {
      const h = 6 + rnd() * 6 + (lean === 0 ? 3 : 0);
      const x = x0 + lean * 2.5;
      blades.push(`M${x.toFixed(1)},${y} q${(lean * 1.5).toFixed(1)},${(-h / 2).toFixed(1)} ${(lean * 4 + rnd() - 0.5).toFixed(1)},${(-h).toFixed(1)}`);
    }
  }
  return (
    <g stroke="var(--leaf)" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.6}>
      {blades.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */

function NodeCard({
  n,
  ix,
  offsetX,
  isRoot,
  walk,
  selection,
  onToggle,
  selected,
  flashing,
  onSelect,
  onCollapse,
  onJump,
  hiddenCount,
  cardRef,
}: {
  n: RootNode;
  ix: Index;
  offsetX: number;
  isRoot: boolean;
  walk: boolean;
  selection: Record<string, string>;
  onToggle: (qid: string, ans: string) => void;
  selected: boolean;
  flashing: boolean;
  onSelect: () => void;
  onCollapse: () => void;
  onJump: () => void;
  hiddenCount: number;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const q = ix.question.get(n.qid);
  if (!q) return null;
  const foundation = q.level === "foundation";
  const chosen = selection[n.qid];

  if (n.repeated)
    return (
      <div
        ref={cardRef}
        className="absolute rounded-lg border border-dashed border-border bg-surface/90 px-2.5 py-1.5 text-xs text-ink-3"
        style={{ left: n.x + offsetX - n.w / 2, top: n.y, width: n.w }}
      >
        <button className="line-clamp-3 text-left leading-snug hover:text-ink" onClick={onJump} title={`已在别处展开：${q.text}（点击跳过去）`}>
          ↗ <span className="text-ink-2">{q.text}</span>
        </button>
      </div>
    );

  // 分岔推演：下层问题选定的答案沿根须传上来，在这里显示它们推出了什么
  const incoming = walk
    ? (ix.prereqsOf.get(n.qid) ?? [])
        .map((p) => {
          const a = selection[p.requires];
          const b = a ? p.branches.find((x) => x.answer === a) : undefined;
          return b ? { from: p.requires, answer: a, leadsTo: b.leadsTo } : null;
        })
        .filter((x): x is { from: string; answer: string; leadsTo: string } => !!x)
    : [];

  return (
    <div
      ref={cardRef}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a,button")) onSelect();
      }}
      className={`absolute rounded-xl border px-3 py-2 transition-shadow ${flashing ? "node-flash" : ""}`}
      style={{
        left: n.x + offsetX - n.w / 2,
        top: n.y,
        width: n.w,
        background: foundation ? "var(--accent-soft)" : "var(--surface)",
        borderColor: selected ? "var(--accent)" : foundation ? "color-mix(in oklab, var(--accent) 40%, transparent)" : "var(--border)",
        boxShadow: selected
          ? "0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent), 0 8px 20px -10px rgb(var(--shadow-rgb) / 0.35)"
          : "0 1px 2px rgb(var(--shadow-rgb) / 0.06), 0 6px 16px -10px rgb(var(--shadow-rgb) / 0.3)",
        cursor: "pointer",
      }}
    >
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
        {foundation && <span className="inline-flex items-center gap-1 font-semibold text-accent-ink"><IconStar size={12} filled />根据论</span>}
        {isRoot && !foundation && <span className="font-semibold text-ink-2">本题</span>}
        <span className="truncate">{ix.concept.get(q.concept)?.name}</span>
      </div>
      <Link href={`/question/${q.id}/`} className={`block font-serif leading-snug hover:underline ${isRoot ? "text-base font-bold" : "text-[14px] font-semibold"}`}>
        {q.text}
      </Link>

      {walk && (
        <div className="mt-1.5 flex flex-wrap gap-1" data-nodrag>
          {q.answers.map((a) => (
            <button
              key={a.id}
              className="btn !rounded-md !px-1.5 !py-0 !text-[12px] !font-normal"
              aria-pressed={chosen === a.id}
              title={a.summary}
              onClick={() => onToggle(q.id, a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {incoming.length > 0 && (
        <ul className="mt-1.5 space-y-1 border-t border-border pt-1.5 text-[12px] leading-snug text-ink-2">
          {incoming.map((x) => (
            <li key={x.from}>
              <span className="text-accent-ink">↑ 取「{answerLabel(ix, x.from, x.answer)}」</span>：<InlineRich text={x.leadsTo} ix={ix} />
            </li>
          ))}
        </ul>
      )}

      {n.hasChildren && (
        <button
          onClick={onCollapse}
          className="absolute -bottom-3 left-1/2 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface px-1.5 text-[11px] text-ink-3 shadow-sm hover:text-ink"
          aria-expanded={!n.collapsed}
          aria-label={n.collapsed ? `展开下面的 ${hiddenCount} 个先决问题` : "收起下面的先决问题"}
        >
          {n.collapsed ? `＋${hiddenCount}` : "－"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
      {(Object.keys(KIND_GLYPH) as PrereqKind[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <svg width="28" height="10" aria-hidden>
            <line x1="1" y1="5" x2="27" y2="5" stroke="var(--root)" strokeWidth={6} strokeLinecap="round" />
            {KIND_DASH[k] && <line x1="3" y1="5" x2="25" y2="5" stroke="var(--surface)" strokeWidth={1.4} strokeDasharray={KIND_DASH[k]} />}
          </svg>
          {KIND_GLYPH[k]} {PREREQ_KIND_LABEL[k]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: "var(--accent-soft)", boxShadow: "inset 0 0 0 1px var(--accent)" }} />
        <IconStar size={12} filled className="text-accent-ink" />
        根据论
      </span>
      <span>根须越粗，下面牵连的问题越多</span>
    </div>
  );
}

function NodeDetail({ ix, n, walk, selection }: { ix: Index; n: RootNode; walk: boolean; selection: Record<string, string> }) {
  const q = ix.question.get(n.qid);
  if (!q) return null;
  const edge = n.edge;
  const chosen = selection[n.qid];
  return (
    <div className="card mt-3 p-3 text-sm sm:p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <LevelBadge level={q.level} />
        <Link href={`/question/${q.id}/`} className="font-serif text-base font-semibold hover:underline">
          {q.text}
        </Link>
        <Link href={`/concept/${q.concept}/`} className="text-xs text-ink-3 hover:text-ink">
          {ix.concept.get(q.concept)?.name}
        </Link>
      </div>
      {q.summary && <p className="prose-cn mt-1 text-ink-2">{q.summary}</p>}
      {edge ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <KindChip kind={edge.kind} />
            <span className="text-ink-2">
              为什么是 <Link href={`/question/${edge.question}/`} className="link">{ix.question.get(edge.question)?.text}</Link> 的先决问题：
              <InlineRich text={edge.why} ix={ix} />
            </span>
          </div>
          {edge.branches.length > 0 && (
            <ul className="space-y-1 pl-1">
              {edge.branches.map((b) => (
                <li key={b.answer} className={walk && chosen === b.answer ? "rounded-md px-2 py-1" : ""} style={walk && chosen === b.answer ? { background: "var(--accent-soft)" } : undefined}>
                  <span className="font-medium">取「{answerLabel(ix, n.qid, b.answer)}」</span>：<InlineRich text={b.leadsTo} ix={ix} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-2 text-ink-3">这是你提出的问题。向下的每一条根，都是回答它之前要先解决的问题；点任意一张卡片，可以看它为什么是先决问题，以及取不同答案时下游怎么走。</p>
      )}
    </div>
  );
}
