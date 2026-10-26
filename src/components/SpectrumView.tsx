"use client";

import { scaleLinear } from "d3-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Jurisdiction, Placement, Spectrum } from "@/lib/schema";

export type EntityInfo = { label: string; jurisdiction?: string; href?: string; kind: "scholar" | "theory" | "jurisdiction" };

type Mode = "time" | "strip";
type Pt = Placement & { info: EntityInfo; px: number; py: number; key: string };

const PAD = { top: 56, right: 28, bottom: 36, left: 56 };

export default function SpectrumView({
  spectrum,
  entities,
  jurisdictions,
}: {
  spectrum: Spectrum;
  entities: Record<string, EntityInfo>;
  jurisdictions: Jurisdiction[];
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(860);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(560, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const years = spectrum.placements.map((p) => p.year).filter((y): y is number => y !== undefined);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const hasOverlay = spectrum.placements.some((p) => p.overlay);

  const [mode, setMode] = useState<Mode>("time");
  const [upTo, setUpTo] = useState(maxYear);
  const [overlay, setOverlay] = useState(false);
  const [showJur, setShowJur] = useState(true);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);

  const visible = spectrum.placements.filter(
    (p) =>
      (overlay || !p.overlay) &&
      (showJur || !p.entity.startsWith("jurisdiction:")) &&
      (p.year === undefined || p.year <= upTo),
  );

  const jurOrder = useMemo(
    () => [...jurisdictions].sort((a, b) => a.order - b.order).map((j) => j.id),
    [jurisdictions],
  );
  const stripRows = useMemo(() => {
    const used = new Set(visible.map((p) => entities[p.entity]?.jurisdiction ?? "—"));
    return [...jurOrder.filter((j) => used.has(j)), ...(used.has("—") ? ["—"] : [])];
  }, [visible, entities, jurOrder]);

  const ROW_H = 64;
  const height =
    mode === "time"
      ? Math.max(420, Math.min(760, (maxYear - minYear) * 3.2)) + PAD.top + PAD.bottom
      : PAD.top + stripRows.length * ROW_H + PAD.bottom;

  const x = scaleLinear().domain([0, 1]).range([PAD.left, width - PAD.right]);
  const y = scaleLinear().domain([minYear - 3, maxYear + 3]).range([PAD.top, height - PAD.bottom]);

  // 一维：每个实体只取截至 upTo 的最新位置
  const points: Pt[] = useMemo(() => {
    const list = visible.map((p, i) => ({ ...p, info: entities[p.entity] ?? { label: p.entity, kind: "scholar" as const }, key: `${p.entity}@${p.year ?? i}` }));
    if (mode === "strip") {
      const latest = new Map<string, (typeof list)[number]>();
      for (const p of list) {
        const prev = latest.get(p.entity);
        if (!prev || (p.year ?? 0) >= (prev.year ?? 0)) latest.set(p.entity, p);
      }
      return [...latest.values()].map((p) => {
        const row = stripRows.indexOf(p.info.jurisdiction ?? "—");
        return { ...p, px: x(p.x), py: PAD.top + row * ROW_H + ROW_H / 2 };
      });
    }
    return list.map((p) => ({ ...p, px: x(p.x), py: y(p.year ?? minYear) }));
  }, [visible, entities, mode, stripRows, x, y, minYear]);

  // 迁移轨迹：同一实体按年份连线（仅时间展开视图）
  const trajectories = useMemo(() => {
    if (mode !== "time") return [];
    const groups = new Map<string, Pt[]>();
    for (const p of points) {
      const g = groups.get(p.entity) ?? [];
      g.push(p);
      groups.set(p.entity, g);
    }
    return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => (a.year ?? 0) - (b.year ?? 0)));
  }, [points, mode]);

  // 标签：右、左、上下错位，贪心避让
  const labels = useMemo(() => {
    const boxes: { x1: number; y1: number; x2: number; y2: number }[] = points.map((p) => ({
      x1: p.px - 7,
      y1: p.py - 7,
      x2: p.px + 7,
      y2: p.py + 7,
    }));
    const hit = (b: { x1: number; y1: number; x2: number; y2: number }) =>
      boxes.some((o) => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);
    const out = new Map<string, { x: number; y: number; anchor: "start" | "end" } | null>();
    const sorted = [...points].sort((a, b) => a.py - b.py || a.px - b.px);
    for (const p of sorted) {
      const text = labelText(p, mode);
      const w = textWidth(text) + 6;
      const cands: { x: number; y: number; anchor: "start" | "end" }[] = [
        { x: p.px + 10, y: p.py + 4, anchor: "start" },
        { x: p.px - 10, y: p.py + 4, anchor: "end" },
        { x: p.px + 8, y: p.py - 13, anchor: "start" },
        { x: p.px + 8, y: p.py + 21, anchor: "start" },
        { x: p.px - 8, y: p.py - 13, anchor: "end" },
        { x: p.px - 8, y: p.py + 21, anchor: "end" },
      ];
      let placed: (typeof cands)[number] | null = null;
      for (const c of cands) {
        const b = c.anchor === "start" ? { x1: c.x, y1: c.y - 13, x2: c.x + w, y2: c.y + 5 } : { x1: c.x - w, y1: c.y - 13, x2: c.x, y2: c.y + 5 };
        if (b.x1 < 0 || b.x2 > width) continue;
        if (!hit(b)) {
          placed = c;
          boxes.push(b);
          break;
        }
      }
      out.set(p.key, placed);
    }
    return out;
  }, [points, width, mode]);

  const usedJur = jurOrder.filter((j) => points.some((p) => p.info.jurisdiction === j));
  const hov = hover ? points.find((p) => p.key === hover.key) : undefined;
  const ax = spectrum.axes[0];
  const jurName = (id?: string) => jurisdictions.find((j) => j.id === id)?.name ?? "";

  return (
    <div>
      {/* 控件：一行，位于图上方 */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex gap-1" role="group" aria-label="视图">
          <button className="btn" aria-pressed={mode === "time"} onClick={() => setMode("time")}>
            时间展开
          </button>
          <button className="btn" aria-pressed={mode === "strip"} onClick={() => setMode("strip")}>
            一维光谱
          </button>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-ink-2">截至</span>
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={upTo}
            onChange={(e) => setUpTo(Number(e.target.value))}
            aria-label="截至年份"
          />
          <span className="w-12 tabular-nums">{upTo}</span>
        </label>
        {hasOverlay && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
            叠加英美（跨法系类比）
          </label>
        )}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showJur} onChange={(e) => setShowJur(e.target.checked)} />
          显示法域通说
        </label>
      </div>

      <div ref={wrap} className="relative overflow-x-auto rounded-lg border border-border bg-surface">
        <svg width={width} height={height} role="img" aria-label={`学术光谱：${spectrum.title}`}>
          <defs>
            <marker id="sp-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-2)" />
            </marker>
          </defs>

          {/* 两极 */}
          <text x={PAD.left} y={22} fontSize={13} fill="var(--ink)" fontWeight={600}>
            ← {ax.left}
          </text>
          <text x={width - PAD.right} y={22} fontSize={13} fill="var(--ink)" fontWeight={600} textAnchor="end">
            {ax.right} →
          </text>
          <text x={width / 2} y={40} fontSize={11} fill="var(--ink-3)" textAnchor="middle">
            {ax.label}（编者定位）
          </text>

          {/* 网格 */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={PAD.top - 6} y2={height - PAD.bottom} stroke="var(--grid)" strokeWidth={t === 0.5 ? 1.5 : 1} />
          ))}
          {mode === "time" &&
            y.ticks(8).map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} opacity={0.6} />
                <text x={PAD.left - 8} y={y(t) + 4} fontSize={11} textAnchor="end" fill="var(--ink-3)">
                  {t}
                </text>
              </g>
            ))}
          {mode === "time" && upTo < maxYear && (
            <rect x={PAD.left} y={y(upTo)} width={width - PAD.left - PAD.right} height={height - PAD.bottom - y(upTo)} fill="var(--surface-2)" opacity={0.5} />
          )}
          {mode === "strip" &&
            stripRows.map((r, i) => (
              <text key={r} x={8} y={PAD.top + i * ROW_H + ROW_H / 2 + 4} fontSize={12} fill="var(--ink-2)">
                {r === "—" ? "学说" : jurisdictions.find((j) => j.id === r)?.short}
              </text>
            ))}

          {/* 迁移轨迹 */}
          {trajectories.map((g) => (
            <polyline
              key={g[0].entity}
              points={g.map((p) => `${p.px},${p.py}`).join(" ")}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={1.5}
              markerEnd="url(#sp-arrow)"
              opacity={0.7}
            />
          ))}

          {/* 点 */}
          {points.map((p) => {
            const color = p.info.jurisdiction ? `var(--jur-${p.info.jurisdiction})` : "var(--ink-2)";
            const lab = labels.get(p.key);
            const isJur = p.info.kind === "jurisdiction";
            return (
              <g
                key={p.key}
                tabIndex={0}
                role="button"
                aria-label={`${labelText(p, mode)}：${p.rationale}`}
                onPointerEnter={(ev) => {
                  const r = wrap.current!.getBoundingClientRect();
                  setHover({ key: p.key, x: ev.clientX - r.left + wrap.current!.scrollLeft, y: ev.clientY - r.top });
                }}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover({ key: p.key, x: p.px, y: p.py })}
                onBlur={() => setHover(null)}
                onClick={() => p.info.href && (window.location.href = p.info.href)}
                style={{ cursor: p.info.href ? "pointer" : "default" }}
              >
                <circle cx={p.px} cy={p.py} r={13} fill="transparent" />
                {isJur ? (
                  <rect
                    x={p.px - 6}
                    y={p.py - 6}
                    width={12}
                    height={12}
                    transform={`rotate(45 ${p.px} ${p.py})`}
                    fill="var(--surface)"
                    stroke={color}
                    strokeWidth={2.5}
                  />
                ) : p.overlay ? (
                  <circle cx={p.px} cy={p.py} r={5} fill="var(--surface)" stroke={color} strokeWidth={2.5} />
                ) : (
                  <circle cx={p.px} cy={p.py} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
                )}
                {lab && (
                  <text x={lab.x} y={lab.y} fontSize={12} textAnchor={lab.anchor} fill={isJur ? "var(--ink)" : "var(--ink-2)"} fontWeight={isJur ? 600 : 400}>
                    {labelText(p, mode)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hov && hover && (
          <div className="viz-tooltip" style={{ left: Math.min(hover.x + 12, width - 330), top: hover.y + 12 }}>
            <div className="font-semibold">
              {hov.info.label}
              {hov.year ? ` · ${hov.year}` : ""}
            </div>
            <div className="text-xs text-ink-3">
              {jurName(hov.info.jurisdiction)}
              {hov.overlay ? " · 跨法系类比" : ""} · 位置 {Math.round(hov.x * 100)}/100
            </div>
            <div className="mt-1">{hov.rationale}</div>
            {(hov.needsSource || hov.status !== "verified") && <div className="mt-1 text-xs text-ink-3">编者定位 · 待核实</div>}
          </div>
        )}
      </div>

      {/* 图例：法域 + 形状 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        {usedJur.map((j) => (
          <span key={j} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `var(--jur-${j})` }} />
            {jurName(j)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden>
            <rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
          </svg>
          法域通说
        </span>
        {hasOverlay && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
            </svg>
            跨法系类比
          </span>
        )}
        {mode === "time" && <span>折线箭头：同一学者或法域的立场迁移</span>}
      </div>

      {/* 表格视图 */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">以表格查看全部 {spectrum.placements.length} 个定位</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-ink-3">
              <tr>
                <th className="py-1 pr-3 font-normal">对象</th>
                <th className="py-1 pr-3 font-normal">年份</th>
                <th className="py-1 pr-3 font-normal">位置</th>
                <th className="py-1 font-normal">理由（编者）</th>
              </tr>
            </thead>
            <tbody>
              {[...spectrum.placements]
                .sort((a, b) => a.x - b.x)
                .map((p, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="py-1.5 pr-3">
                      {entities[p.entity]?.label ?? p.entity}
                      {p.overlay && <span className="text-ink-3">（类比）</span>}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{p.year ?? "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{Math.round(p.x * 100)}</td>
                    <td className="py-1.5 text-ink-2">{p.rationale}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** 12px 字号下的近似宽度：中日文字符约 12px，拉丁字符与数字约 6.8px */
function textWidth(t: string) {
  let w = 0;
  for (const ch of t) w += ch.charCodeAt(0) > 0x2e80 ? 12 : 6.8;
  return w;
}

function labelText(p: Pt, mode: Mode) {
  if (p.info.kind === "jurisdiction") return `${p.info.label}${mode === "strip" && p.year ? ` ${p.year}` : ""}`;
  return mode === "strip" && p.year ? `${p.info.label} ${p.year}` : p.info.label;
}
