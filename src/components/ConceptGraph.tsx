"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ElementDefinition, LayoutOptions, Stylesheet } from "cytoscape";
import CyGraph, { type CssVars } from "./CyGraph";
import { AREA_LABEL, AREA_ORDER, type Area } from "@/lib/schema";

export type GNode = { id: string; label: string; kind: "foundation" | "problem"; tradition: "civil" | "common" | "both"; area: Area };
export type GEdge = { source: string; target: string; type: string; label: string; weight?: number; description?: string };

const TYPE_LABEL: Record<string, string> = {
  prereq: "先决（由问题层汇总）",
  functional_equivalent: "功能对应",
  symmetric: "对称问题",
  derived_from: "派生自",
  part_of: "构成要素",
  is_a: "属种",
  opposes: "对立",
  transplanted_to: "继受至",
};

// 总览只有十来个节点：按体系顺序排成两行网格，边是各体系位置之间（汇总后）的先决与关系
const OVERVIEW_LAYOUT = { name: "grid", rows: 2, padding: 36, avoidOverlap: true, avoidOverlapPadding: 30, condense: false } as unknown as LayoutOptions;

// 分层布局：先决边是有方向的，根据论自然落在左侧、具体问题在右侧
const LAYOUT = { name: "dagre", rankDir: "LR", nodeSep: 14, rankSep: 70, edgeSep: 6, padding: 20, nodeDimensionsIncludeLabels: true } as unknown as LayoutOptions;

export default function ConceptGraph({
  nodes,
  edges,
  height = 600,
  initialTypes,
}: {
  nodes: GNode[];
  edges: GEdge[];
  height?: number;
  initialTypes?: string[];
}) {
  const router = useRouter();
  const types = useMemo(() => [...new Set(edges.map((e) => e.type))].sort((a, b) => Object.keys(TYPE_LABEL).indexOf(a) - Object.keys(TYPE_LABEL).indexOf(b)), [edges]);
  const [on, setOn] = useState<Set<string>>(() => new Set(initialTypes ?? types));
  const [tradition, setTradition] = useState<"all" | "civil" | "common">("all");
  const [hideIsolated, setHideIsolated] = useState(true);
  const [area, setArea] = useState<Area | "all">("all");
  // 概念很多时，默认先看体系位置之间的汇总关系
  const [overview, setOverview] = useState(nodes.length > 20);

  const elements: ElementDefinition[] = useMemo(() => {
    const keepNode = (n: GNode) => tradition === "all" || n.tradition === tradition || n.tradition === "both";
    let ns = nodes.filter(keepNode);
    let ids = new Set(ns.map((n) => n.id));
    let es = edges.filter((e) => on.has(e.type) && ids.has(e.source) && ids.has(e.target));
    if (area !== "all") {
      // 只看某一体系位置：保留该位置的概念，以及与之直接相连的概念
      const core = new Set(ns.filter((n) => n.area === area).map((n) => n.id));
      es = es.filter((e) => core.has(e.source) || core.has(e.target));
      const keep = new Set([...core, ...es.flatMap((e) => [e.source, e.target])]);
      ns = ns.filter((n) => keep.has(n.id));
      ids = keep;
    }
    if (hideIsolated) {
      const linked = new Set(es.flatMap((e) => [e.source, e.target]));
      ns = ns.filter((n) => linked.has(n.id));
      ids = linked;
    }
    return [
      ...ns.map((n) => ({ data: { id: n.id, label: n.label, kind: n.kind, tradition: n.tradition } })),
      ...es.map((e, i) => ({
        data: { id: `e${i}-${e.source}-${e.target}`, source: e.source, target: e.target, type: e.type, label: e.label, weight: e.weight ?? 1 },
      })),
    ];
  }, [nodes, edges, on, tradition, hideIsolated, area]);

  const areaOf = useMemo(() => new Map(nodes.map((n) => [n.id, n.area])), [nodes]);
  const overviewElements: ElementDefinition[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges) {
      if (!on.has(e.type)) continue;
      const a = areaOf.get(e.source);
      const b = areaOf.get(e.target);
      if (!a || !b || a === b) continue;
      const k = `${a}>${b}`;
      counts.set(k, (counts.get(k) ?? 0) + (e.weight ?? 1));
    }
    const present = AREA_ORDER.filter((a) => nodes.some((n) => n.area === a));
    return [
      ...present.map((a) => ({
        data: { id: `area:${a}`, label: `${AREA_LABEL[a]}（${nodes.filter((n) => n.area === a).length}）`, kind: "area", tradition: "both" },
      })),
      ...[...counts].map(([k, n]) => {
        const [a, b] = k.split(">");
        return { data: { id: `ae-${k}`, source: `area:${a}`, target: `area:${b}`, type: "prereq", label: String(n), weight: Math.min(n, 6) } };
      }),
    ];
  }, [edges, nodes, on, areaOf]);

  const visibleEdges = edges.filter((e) => on.has(e.type));

  return (
    <div>
      {nodes.length > 20 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <div className="flex gap-1" role="group" aria-label="视图层级">
            <button className="btn" aria-pressed={overview} onClick={() => setOverview(true)}>
              体系位置总览
            </button>
            <button className="btn" aria-pressed={!overview} onClick={() => setOverview(false)}>
              专题
            </button>
          </div>
          <span className="text-ink-3">
            {overview ? "点击一个体系位置，展开它的专题与直接相连的专题。" : area !== "all" ? `当前：${AREA_LABEL[area]}及与之相连的专题` : "全部专题"}
          </span>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex gap-1" role="group" aria-label="法系">
          {(
            [
              ["all", "全部"],
              ["civil", "大陆法系"],
              ["common", "英美法系"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className="btn" aria-pressed={tradition === k} onClick={() => setTradition(k)}>
              {l}
            </button>
          ))}
        </div>
        {nodes.length > 15 && (
          <select
            className="rounded-lg border border-border bg-surface px-3 py-1.5"
            value={area}
            onChange={(e) => setArea(e.target.value as Area | "all")}
            aria-label="体系位置"
          >
            <option value="all">全部体系位置</option>
            {AREA_ORDER.filter((a) => nodes.some((n) => n.area === a)).map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
        )}
        {types.map((t) => (
          <label key={t} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={on.has(t)}
              onChange={(e) =>
                setOn((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.add(t);
                  else n.delete(t);
                  return n;
                })
              }
            />
            <EdgeKey type={t} />
            {TYPE_LABEL[t] ?? t}
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-ink-3">
          <input type="checkbox" checked={hideIsolated} onChange={(e) => setHideIsolated(e.target.checked)} />
          隐藏没有连线的概念
        </label>
      </div>

      <CyGraph
        elements={overview ? overviewElements : elements}
        style={graphStyle}
        layout={overview ? OVERVIEW_LAYOUT : LAYOUT}
        height={overview ? Math.min(height, 560) : height}
        onNodeTap={(id) => {
          if (id.startsWith("area:")) {
            setArea(id.slice(5) as Area);
            setOverview(false);
          } else router.push(`/concept/${id}/`);
        }}
        ariaLabel="概念关系图谱"
      />

      <p className="mt-2 text-xs text-ink-3">
        「功能对应」连接的是跨法系处理同类事实结构的概念，并不意味着两者概念等同。粗框为根据论，虚线框为英美法系的概念。
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">以列表查看 {visibleEdges.length} 条关系</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {visibleEdges.map((e, i) => (
            <li key={i}>
              <span className="text-ink-2">{nodes.find((n) => n.id === e.source)?.label}</span>
              <span className="mx-1.5 text-ink-3">—{e.label}→</span>
              <span className="text-ink-2">{nodes.find((n) => n.id === e.target)?.label}</span>
              {e.description && <span className="text-ink-3">：{e.description}</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function EdgeKey({ type }: { type: string }) {
  const s = edgeLook(type);
  return (
    <svg width="22" height="8" aria-hidden>
      <line x1="0" y1="4" x2="22" y2="4" stroke={`var(${s.color})`} strokeWidth={s.width} strokeDasharray={s.dash ? "4 3" : s.dot ? "1.5 2.5" : undefined} />
    </svg>
  );
}

function edgeLook(type: string) {
  switch (type) {
    case "functional_equivalent":
      return { color: "--accent", width: 2.5, dash: true, dot: false };
    case "symmetric":
      return { color: "--jur-jp", width: 2.5, dash: false, dot: true };
    case "prereq":
      return { color: "--ink-3", width: 1.5, dash: false, dot: false };
    default:
      return { color: "--ink-2", width: 1.5, dash: false, dot: false };
  }
}

function graphStyle(v: CssVars): Stylesheet[] {
  const sheet = [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        "background-color": v("--surface"),
        "border-color": v("--ink-3"),
        "border-width": 1.5,
        label: "data(label)",
        color: v("--ink"),
        "font-size": 12,
        "font-family": v("--font-sans"),
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": "96px",
        width: "label",
        height: "label",
        padding: "8px",
      },
    },
    {
      selector: 'node[kind = "foundation"]',
      style: { "border-width": 3, "border-color": v("--accent"), "background-color": v("--accent-soft"), "font-weight": "bold" },
    },
    { selector: 'node[tradition = "common"]', style: { "border-style": "dashed" } },
    {
      selector: 'node[kind = "area"]',
      style: { "font-size": 15, "font-weight": "bold", padding: "14px", "border-width": 2, "border-color": v("--ink-2"), "background-color": v("--surface-2") },
    },
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": v("--ink-2"),
        "target-arrow-color": v("--ink-2"),
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": 10,
        color: v("--ink-3"),
        "text-background-color": v("--surface"),
        "text-background-opacity": 1,
        "text-background-padding": "2px",
        "text-rotation": "autorotate",
      },
    },
    {
      selector: 'edge[type = "prereq"]',
      style: { "line-color": v("--ink-3"), "target-arrow-color": v("--ink-3"), width: "mapData(weight, 1, 6, 1.2, 4)", label: "" },
    },
    {
      selector: 'edge[id ^= "ae-"]',
      style: { label: "data(label)", "font-size": 12 },
    },
    {
      selector: 'edge[type = "functional_equivalent"]',
      style: { "line-color": v("--accent"), "line-style": "dashed", width: 2.5, "target-arrow-shape": "none", "source-arrow-shape": "none", label: "" },
    },
    {
      selector: 'edge[type = "symmetric"]',
      style: { "line-color": v("--jur-jp"), "line-style": "dotted", width: 2.5, "target-arrow-shape": "none", label: "" },
    },
  ];
  return sheet as unknown as Stylesheet[];
}
