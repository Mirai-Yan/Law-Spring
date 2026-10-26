"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ElementDefinition, LayoutOptions, Stylesheet } from "cytoscape";
import CyGraph, { type CssVars } from "./CyGraph";

export type GenScholar = { id: string; name: string; jurisdiction: string; theory?: string; needsSource?: boolean };
export type GenEdge = { from: string; to: string; kind: "teacher" | "influence" };
export type GenTheory = { id: string; name: string; slot: number };

const LAYOUT = { name: "dagre", rankDir: "TB", nodeSep: 16, rankSep: 64, padding: 20, nodeDimensionsIncludeLabels: true } as unknown as LayoutOptions;

export default function Genealogy({
  scholars,
  edges,
  theories,
  jurisdictions,
}: {
  scholars: GenScholar[];
  edges: GenEdge[];
  theories: GenTheory[];
  jurisdictions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [colorBy, setColorBy] = useState<"jur" | "theory">("jur");
  const [onlyLinked, setOnlyLinked] = useState(true);

  const elements: ElementDefinition[] = useMemo(() => {
    const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
    const ns = onlyLinked ? scholars.filter((s) => linked.has(s.id)) : scholars;
    const theorySlot = new Map(theories.map((t) => [t.id, t.slot]));
    return [
      ...ns.map((s) => ({
        data: {
          id: s.id,
          label: s.name,
          color: colorBy === "jur" ? `--jur-${s.jurisdiction}` : s.theory ? `--th-${theorySlot.get(s.theory)}` : "--ink-3",
        },
      })),
      ...edges.map((e, i) => ({ data: { id: `g${i}`, source: e.from, target: e.to, kind: e.kind } })),
    ];
  }, [scholars, edges, theories, colorBy, onlyLinked]);

  const linkedIds = new Set(edges.flatMap((e) => [e.from, e.to]));
  const shown = onlyLinked ? scholars.filter((s) => linkedIds.has(s.id)) : scholars;
  const usedJur = jurisdictions.filter((j) => shown.some((s) => s.jurisdiction === j.id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex gap-1" role="group" aria-label="着色方式">
          <button className="btn" aria-pressed={colorBy === "jur"} onClick={() => setColorBy("jur")}>
            按法域着色
          </button>
          <button className="btn" aria-pressed={colorBy === "theory"} onClick={() => setColorBy("theory")}>
            按学说着色
          </button>
        </div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} />
          只显示有师承或影响关系的学者
        </label>
      </div>

      {edges.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-3">这个专题下还没有收录师承或影响关系。</p>
      ) : (
        <CyGraph
          elements={elements}
          style={genStyle}
          layout={LAYOUT}
          height={520}
          onNodeTap={(id) => router.push(`/scholar/${id}/`)}
          ariaLabel="学术谱系图"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        {colorBy === "jur"
          ? usedJur.map((j) => (
              <span key={j.id} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `var(--jur-${j.id})` }} />
                {j.name}
              </span>
            ))
          : theories.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `var(--th-${t.slot})` }} />
                {t.name}
              </span>
            ))}
        {colorBy === "theory" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--ink-3)" }} />
            未归入
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" y1="4" x2="22" y2="4" stroke="var(--ink-2)" strokeWidth="2" />
          </svg>
          师承（老师 → 学生）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" y1="4" x2="22" y2="4" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          思想影响
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-3">师承关系最容易出错，图中所有关系都待核实。</p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">以列表查看 {edges.length} 条关系</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {edges.map((e, i) => (
            <li key={i}>
              {scholars.find((s) => s.id === e.from)?.name}
              <span className="mx-1.5 text-ink-3">{e.kind === "teacher" ? "—师承→" : "—影响→"}</span>
              {scholars.find((s) => s.id === e.to)?.name}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function genStyle(v: CssVars): Stylesheet[] {
  const sheet = [
    {
      selector: "node",
      style: {
        width: 14,
        height: 14,
        "background-color": (ele: { data: (k: string) => string }) => v(ele.data("color")) || v("--ink-3"),
        "border-color": v("--surface"),
        "border-width": 2,
        label: "data(label)",
        color: v("--ink"),
        "font-size": 12,
        "font-family": v("--font-sans"),
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-background-color": v("--surface"),
        "text-background-opacity": 0.85,
        "text-background-padding": "1px",
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": v("--ink-2"),
        "target-arrow-color": v("--ink-2"),
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.8,
        "curve-style": "bezier",
      },
    },
    {
      selector: 'edge[kind = "influence"]',
      style: { width: 1.5, "line-style": "dashed", "line-color": v("--ink-3"), "target-arrow-color": v("--ink-3") },
    },
  ];
  return sheet as unknown as Stylesheet[];
}
