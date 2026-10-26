"use client";

import { scaleLinear } from "d3-scale";
import { useEffect, useMemo, useRef, useState } from "react";
import { traceToOrigin } from "@/lib/graph";
import { EVENT_TYPE_LABEL, ORIGIN_TYPE_LABEL, type Jurisdiction, type LawEvent } from "@/lib/schema";
import { IconStar } from "./icons";

export type LaneEvent = Pick<
  LawEvent,
  "id" | "year" | "circa" | "jurisdiction" | "type" | "title" | "description" | "derivedFrom" | "originOf" | "originType" | "status" | "needsSource"
> & {
  /** 不属于当前专题、只作为来源背景显示的事件 */
  context?: boolean;
  scholarNames: string[];
  workTitles: string[];
};

const LANE_H = 56;
const PAD = { top: 28, right: 24, bottom: 28, left: 92 };

export default function EvolutionLanes({
  events,
  jurisdictions,
  conceptId,
  initialTraceFrom,
}: {
  events: LaneEvent[];
  jurisdictions: Jurisdiction[];
  conceptId?: string;
  initialTraceFrom?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [trace, setTrace] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(720, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = useMemo(() => {
    const used = new Set(events.map((e) => e.jurisdiction));
    return [...jurisdictions].sort((a, b) => a.order - b.order).filter((j) => used.has(j.id));
  }, [events, jurisdictions]);

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const [minY, maxY] = useMemo(() => {
    const ys = events.map((e) => e.year);
    return [Math.min(...ys), Math.max(...ys)];
  }, [events]);

  const x = useMemo(
    () => scaleLinear().domain([minY - 4, maxY + 4]).range([PAD.left, width - PAD.right]),
    [minY, maxY, width],
  );
  const height = PAD.top + lanes.length * LANE_H + PAD.bottom;

  // 同一泳道内年份相近的事件错开，避免重叠
  const pos = useMemo(() => {
    const m = new Map<string, { cx: number; cy: number }>();
    lanes.forEach((lane, li) => {
      const inLane = events.filter((e) => e.jurisdiction === lane.id).sort((a, b) => a.year - b.year);
      const placed: number[] = [];
      inLane.forEach((e) => {
        const cx = x(e.year);
        const near = placed.filter((px) => Math.abs(px - cx) < 14).length;
        placed.push(cx);
        const offset = near === 0 ? 0 : (near % 2 === 1 ? -1 : 1) * Math.ceil(near / 2) * 12;
        m.set(e.id, { cx, cy: PAD.top + li * LANE_H + LANE_H / 2 + offset });
      });
    });
    return m;
  }, [events, lanes, x]);

  const latest = useMemo(
    () => [...events].filter((e) => !e.context).sort((a, b) => b.year - a.year)[0]?.id,
    [events],
  );
  const origin = events.find((e) => conceptId && e.originOf === conceptId);

  // 没有指定起点时，从「能一路走回奇点的最新事件」开始；有些较新的事件（如立法）所在的链条并不通向奇点
  const latestReaching = useMemo(() => {
    const sorted = [...events].filter((e) => !e.context).sort((a, b) => b.year - a.year);
    for (const e of sorted) {
      const p = traceToOrigin(events, e.id, conceptId);
      const last = events.find((x) => x.id === p[p.length - 1]);
      if (last?.originOf && (!conceptId || last.originOf === conceptId)) return e.id;
    }
    return undefined;
  }, [events, conceptId]);

  const startTrace = (from?: string) => {
    const start = from ?? selected ?? initialTraceFrom ?? latestReaching ?? latest;
    if (!start) return;
    const path = traceToOrigin(events, start, conceptId);
    setTrace(path);
    setStep(0);
    setSelected(path[0]);
  };

  const traceSet = new Set(trace ? trace.slice(0, step + 1) : []);
  const traceEdges = new Set<string>();
  if (trace) for (let i = 0; i < Math.min(step, trace.length - 1); i++) traceEdges.add(`${trace[i + 1]}>${trace[i]}`);

  const ticks = x.ticks(Math.max(4, Math.floor(width / 110)));
  const sel = selected ? byId.get(selected) : undefined;
  const hov = hover ? byId.get(hover.id) : undefined;

  const stepTo = (s: number) => {
    if (!trace) return;
    const n = Math.max(0, Math.min(trace.length - 1, s));
    setStep(n);
    setSelected(trace[n]);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button className="btn" onClick={() => startTrace()}>
          ⟲ 逐步回溯{selected ? "（从所选事件）" : "（从最近的可回溯事件）"}
        </button>
        {trace && (
          <>
            <button className="btn" onClick={() => stepTo(step + 1)} disabled={step >= trace.length - 1}>
              向前一步 ←
            </button>
            <button className="btn" onClick={() => stepTo(step - 1)} disabled={step <= 0}>
              → 退回
            </button>
            <span className="text-ink-3">
              第 {step + 1} / {trace.length} 步
              {step === trace.length - 1 && byId.get(trace[step])?.originOf && "：已到达奇点"}
            </span>
            <button className="btn" onClick={() => setTrace(null)}>
              结束
            </button>
          </>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" y1="4" x2="22" y2="4" stroke="var(--ink-3)" strokeWidth="1.5" />
            </svg>
            同一法域内派生
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" y1="4" x2="22" y2="4" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            跨法域继受或影响
          </span>
          <span className="inline-flex items-center gap-1"><IconStar size={12} filled />奇点</span>
        </span>
      </div>

      <div ref={wrap} className="relative overflow-x-auto rounded-lg border border-border bg-surface">
        <svg width={width} height={height} role="img" aria-label="学说演化泳道图">
          <defs>
            <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-3)" />
            </marker>
            <marker id="arrow-accent" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* 泳道 */}
          {lanes.map((l, i) => (
            <g key={l.id}>
              <rect
                x={0}
                y={PAD.top + i * LANE_H}
                width={width}
                height={LANE_H}
                fill={i % 2 ? "var(--surface-2)" : "transparent"}
                opacity={0.6}
              />
              <circle cx={14} cy={PAD.top + i * LANE_H + LANE_H / 2} r={4} fill={`var(--jur-${l.id})`} />
              <text x={24} y={PAD.top + i * LANE_H + LANE_H / 2 + 4} fontSize={12} fill="var(--ink-2)">
                {l.name.length > 5 ? l.short : l.name}
              </text>
            </g>
          ))}

          {/* 时间刻度 */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--grid)" strokeWidth={1} />
              <text x={x(t)} y={height - 8} fontSize={11} textAnchor="middle" fill="var(--ink-3)">
                {t}
              </text>
            </g>
          ))}

          {/* 派生边 */}
          {events.flatMap((e) =>
            e.derivedFrom
              .filter((p) => pos.has(p))
              .map((p) => {
                const a = pos.get(p)!;
                const b = pos.get(e.id)!;
                const cross = byId.get(p)!.jurisdiction !== e.jurisdiction;
                const onTrace = traceEdges.has(`${p}>${e.id}`);
                const dimmed = trace && !onTrace;
                const midX = (a.cx + b.cx) / 2;
                const d = cross
                  ? `M${a.cx},${a.cy} C${midX},${a.cy} ${midX},${b.cy} ${b.cx},${b.cy}`
                  : `M${a.cx},${a.cy} L${b.cx},${b.cy}`;
                return (
                  <path
                    key={`${p}>${e.id}`}
                    d={d}
                    fill="none"
                    stroke={onTrace ? "var(--accent)" : "var(--ink-3)"}
                    strokeWidth={onTrace ? 2.5 : 1.2}
                    strokeDasharray={cross ? "4 3" : undefined}
                    opacity={dimmed ? 0.15 : onTrace ? 1 : 0.55}
                    markerEnd={onTrace ? "url(#arrow-accent)" : "url(#arrow)"}
                  />
                );
              }),
          )}

          {/* 事件节点 */}
          {events.map((e) => {
            const p = pos.get(e.id)!;
            const isOrigin = conceptId ? e.originOf === conceptId : !!e.originOf;
            const active = selected === e.id;
            const dim = (trace && !traceSet.has(e.id)) || e.context;
            const color = `var(--jur-${e.jurisdiction})`;
            return (
              <g
                key={e.id}
                transform={`translate(${p.cx},${p.cy})`}
                opacity={dim ? 0.35 : 1}
                style={{ cursor: "pointer" }}
                tabIndex={0}
                role="button"
                aria-label={`${e.year}${e.circa ? "前后" : ""} ${e.title}`}
                onClick={() => setSelected(e.id)}
                onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && setSelected(e.id)}
                onPointerEnter={(ev) => {
                  const r = wrap.current!.getBoundingClientRect();
                  setHover({ id: e.id, x: ev.clientX - r.left + wrap.current!.scrollLeft, y: ev.clientY - r.top });
                }}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover({ id: e.id, x: p.cx, y: p.cy })}
                onBlur={() => setHover(null)}
              >
                <circle r={14} fill="transparent" />
                {isOrigin ? (
                  <path
                    d={starPath(9, 4)}
                    fill={color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ) : (
                  <circle
                    r={active ? 6.5 : 5}
                    fill={e.type === "prehistory" ? "var(--surface)" : color}
                    stroke={e.type === "prehistory" ? color : "var(--surface)"}
                    strokeWidth={2}
                  />
                )}
                {active && <circle r={11} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
                {(isOrigin || active) && (
                  <text y={-14} textAnchor="middle" fontSize={11} fill="var(--ink)" fontWeight={600}>
                    {e.year}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hov && hover && (
          <div className="viz-tooltip" style={{ left: Math.min(hover.x + 12, width - 330), top: hover.y + 12 }}>
            <div className="font-semibold">
              {hov.year}
              {hov.circa ? "（约）" : ""} · {EVENT_TYPE_LABEL[hov.type]}
            </div>
            <div>{hov.title}</div>
          </div>
        )}
      </div>

      {origin && (
        <div className="mt-4 rounded-lg p-4" style={{ background: "var(--accent-soft)" }}>
          <div className="text-sm text-accent-ink">
            <IconStar size={12} filled /> 奇点 · {origin.year}
            {origin.circa ? "（约）" : ""} · {origin.originType ? ORIGIN_TYPE_LABEL[origin.originType] : ""}
          </div>
          <div className="mt-1 font-serif text-lg font-bold">{origin.title}</div>
          {origin.description && <p className="prose-cn mt-1 text-ink-2">{origin.description}</p>}
        </div>
      )}

      {sel && (
        <div className="card mt-4 p-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: `var(--jur-${sel.jurisdiction})` }} />
            {jurisdictions.find((j) => j.id === sel.jurisdiction)?.name} · {sel.year}
            {sel.circa ? "（约，编者估计）" : ""} · {EVENT_TYPE_LABEL[sel.type]}
            {sel.status !== "verified" && <span className="chip">待核实</span>}
            {sel.needsSource && <span className="chip">缺出处</span>}
          </div>
          <div className="mt-1 font-serif text-lg font-bold">{sel.title}</div>
          {sel.description && <p className="prose-cn mt-1 text-ink-2">{sel.description}</p>}
          {(sel.scholarNames.length > 0 || sel.workTitles.length > 0) && (
            <div className="mt-2 space-y-0.5 text-sm text-ink-2">
              {sel.scholarNames.length > 0 && <div>学者：{sel.scholarNames.join("、")}</div>}
              {sel.workTitles.length > 0 && <div>文献：{sel.workTitles.join("；")}</div>}
            </div>
          )}
          {sel.derivedFrom.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 text-sm">
              <span className="text-ink-3">来源：</span>
              {sel.derivedFrom
                .filter((d) => byId.has(d))
                .map((d) => (
                  <button key={d} className="chip hover:bg-surface-2" onClick={() => setSelected(d)}>
                    {byId.get(d)!.year} {byId.get(d)!.title}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 表格视图：不依赖悬停也能读到全部事件 */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">以列表查看全部 {events.length} 个事件</summary>
        <ol className="mt-2 space-y-1 text-sm">
          {[...events]
            .sort((a, b) => a.year - b.year)
            .map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-ink-3">
                  {e.year}
                  {e.circa ? "?" : ""}
                </span>
                <span className="w-8 shrink-0 text-ink-3">{jurisdictions.find((j) => j.id === e.jurisdiction)?.short}</span>
                <button className="text-left hover:underline" onClick={() => setSelected(e.id)}>
                  {e.originOf === conceptId && <IconStar size={11} filled />}
                  {e.title}
                </button>
              </li>
            ))}
        </ol>
      </details>
    </div>
  );
}

function starPath(outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}
