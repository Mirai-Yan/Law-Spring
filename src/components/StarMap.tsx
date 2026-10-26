"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type ForceGraphInstance from "force-graph";
import { CONSTELLATION_LABEL, constellationCenters, STAR_GROUP_LABEL, type StarGroup, type StarLink, type StarLinkType, type StarNode } from "@/lib/starmap";
import { AREA_LABEL, AREA_ORDER, type Area } from "@/lib/schema";
import { LINK_DASH, skyCss, STAR_STYLES, type StarStyle } from "@/lib/star-themes";
import { THEME_EVENT, type ResolvedTheme } from "@/lib/theme";
import { LINK_LABEL, LINK_ORDER, stripWiki, type FlyRef, type SL, type SN } from "./starmap-shared";
import { createPainter, drawConstellationName, drawHaze, drawLabels, drawLink, drawStar, hexA, paintSky, setPainterTheme, updateFocus } from "./starfield/paint";
import { IconStar, IconX } from "./icons";

// 3D 依赖 three.js，体积较大，只在切换到沉浸模式时加载
const StarCanvas3DLazy = dynamic(() => import("./StarMap3D"), {
  ssr: false,
  loading: () => <div className="grid h-[60vh] place-items-center text-sm opacity-60">正在点亮星系…</div>,
});

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(mq.matches);
    const on = () => setR(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return r;
}

/** 当前界面主题：星图的天空、材质随之切换，不必刷新页面 */
function useThemeId(): ResolvedTheme {
  const [t, setT] = useState<ResolvedTheme>("light");
  useEffect(() => {
    const read = () => {
      const v = document.documentElement.dataset.theme as ResolvedTheme | undefined;
      setT(v && v in STAR_STYLES ? v : "light");
    };
    read();
    window.addEventListener(THEME_EVENT, read);
    return () => window.removeEventListener(THEME_EVENT, read);
  }, []);
  return t;
}

/** 关系类型的线型示例（与画布上一致） */
function DashSample({ type }: { type: StarLinkType }) {
  const d = LINK_DASH[type];
  return (
    <svg aria-hidden width="22" height="6" className="shrink-0 text-ink-3">
      <line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth={type === "prereq" ? 2 : 1.4} strokeDasharray={d.length ? d.join(" ") : undefined} strokeLinecap="round" />
    </svg>
  );
}

export default function StarMap({ nodes, links }: { nodes: StarNode[]; links: StarLink[] }) {
  const [tradition, setTradition] = useState<"all" | "civil" | "common">("all");
  const [area, setArea] = useState<Area | "all">("all");
  const types = useMemo(() => LINK_ORDER.filter((t) => links.some((l) => l.type === t)), [links]);
  const [on, setOn] = useState<Set<StarLinkType>>(() => new Set(types));
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const reduced = useReducedMotion();
  const themeId = useThemeId();
  const style = STAR_STYLES[themeId];

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // 按筛选条件得到可见的星和光路
  const visible = useMemo(() => {
    let ns = nodes.filter((n) => tradition === "all" || n.tradition === tradition || n.tradition === "both");
    let ids = new Set(ns.map((n) => n.id));
    let ls = links.filter((l) => on.has(l.type) && ids.has(l.source) && ids.has(l.target));
    if (area !== "all") {
      const core = new Set(ns.filter((n) => n.area === area).map((n) => n.id));
      ls = ls.filter((l) => core.has(l.source) || core.has(l.target));
      const keep = new Set([...core, ...ls.flatMap((l) => [l.source, l.target])]);
      ns = ns.filter((n) => keep.has(n.id));
      ids = keep;
    }
    return { nodes: ns, links: ls };
  }, [nodes, links, tradition, area, on]);

  const neighbors = useMemo(() => {
    const m = new Map<string, { id: string; type: StarLinkType; dir: "out" | "in" }[]>();
    for (const l of links) {
      m.set(l.source, [...(m.get(l.source) ?? []), { id: l.target, type: l.type, dir: "out" }]);
      m.set(l.target, [...(m.get(l.target) ?? []), { id: l.source, type: l.type, dir: "in" }]);
    }
    return m;
  }, [links]);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return nodes.filter((n) => n.label.includes(q)).slice(0, 8);
  }, [query, nodes]);

  // 「飞到某颗星」由当前模式的画布实现，这里只登记
  const flyRef = useRef<(id: string) => void>(() => {});
  const select = (id: string) => {
    setSelected(id);
    flyRef.current(id);
  };

  const sel = selected ? byId.get(selected) : undefined;
  const fullRef = useRef<HTMLDivElement>(null);
  const panel = style.panel;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex gap-1" role="group" aria-label="维度">
          <button className="btn" aria-pressed={mode === "2d"} onClick={() => setMode("2d")}>
            星图
          </button>
          <button className="btn" aria-pressed={mode === "3d"} onClick={() => setMode("3d")}>
            沉浸模式（3D）
          </button>
        </div>
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
        <select className="rounded-[10px] border border-border bg-surface px-3 py-1.5" value={area} onChange={(e) => setArea(e.target.value as Area | "all")} aria-label="体系位置">
          <option value="all">全部星座</option>
          {AREA_ORDER.filter((a) => nodes.some((n) => n.area === a)).map((a) => (
            <option key={a} value={a}>
              {AREA_LABEL[a]}
            </option>
          ))}
        </select>
        <div className="relative ml-auto">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                select(matches[0].id);
                setQuery("");
              }
            }}
            placeholder="找一颗星，如：法益"
            aria-label="搜索概念"
            className="w-44 rounded-[10px] border border-border bg-surface px-3 py-1.5 outline-none sm:w-56"
          />
          {matches.length > 0 && (
            <ul className="card absolute right-0 top-full z-30 mt-1 w-56 p-1 text-sm" style={{ boxShadow: "var(--elev-2)" }}>
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-surface-2"
                    onClick={() => {
                      select(m.id);
                      setQuery("");
                    }}
                  >
                    <span className="inline-block size-2 rounded-full" style={{ background: style.groups[m.group] }} />
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
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
            <DashSample type={t} />
            {LINK_LABEL[t]}
          </label>
        ))}
      </div>

      <div
        ref={fullRef}
        className="relative overflow-hidden rounded-[20px] border border-border"
        style={{ background: skyCss(style), boxShadow: "var(--elev-3)" }}
      >
        {mode === "2d" ? (
          <StarCanvas2D data={visible} selected={selected} onSelect={setSelected} neighbors={neighbors} reduced={reduced} flyRef={flyRef} style={style} themeId={themeId} />
        ) : (
          <StarCanvas3DLazy key={themeId} data={visible} onSelect={setSelected} reduced={reduced} flyRef={flyRef} style={style} />
        )}

        <div className="pointer-events-none absolute bottom-2 left-3 text-[11px]" style={{ color: style.darkSky ? "rgb(255 255 255 / 0.5)" : hexA(style.ink, 0.55) }}>
          {mode === "2d" ? "滚轮缩放 · 拖动平移 · 点星查看" : "拖动旋转 · 滚轮远近 · 右键平移 · 点星飞近"}
        </div>
        <button
          className="btn absolute right-2 top-2 !px-2 !py-0.5 !text-[13px]"
          onClick={() => {
            const el = fullRef.current;
            if (!el) return;
            if (document.fullscreenElement) document.exitFullscreen();
            else el.requestFullscreen?.();
          }}
        >
          全屏
        </button>

        {sel && (
          <aside
            className="absolute bottom-3 right-3 top-12 z-10 flex w-72 max-w-[calc(100%-1.5rem)] flex-col overflow-y-auto rounded-[14px] p-4 text-sm"
            style={{
              background: panel.bg,
              color: panel.ink,
              border: `1px solid ${panel.border}`,
              boxShadow: "0 18px 40px -12px rgb(0 0 0 / 0.35)",
              backdropFilter: "blur(14px) saturate(140%)",
              WebkitBackdropFilter: "blur(14px) saturate(140%)",
            }}
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] tracking-[0.1em]" style={{ color: panel.ink2 }}>
                  <span className="inline-block size-2 rounded-full" style={{ background: style.groups[sel.group] }} />
                  {CONSTELLATION_LABEL[sel.area]}
                  {sel.tradition === "common" && " · 英美法系"}
                </div>
                <h3 className="mt-1 flex items-center gap-1.5 font-serif text-lg font-semibold leading-snug">
                  {sel.foundation && (
                    <span style={{ color: panel.link }}>
                      <IconStar size={14} filled />
                    </span>
                  )}
                  {sel.label}
                </h3>
              </div>
              <button className="rounded-md p-1 opacity-60 hover:opacity-100" onClick={() => setSelected(null)} aria-label="关闭">
                <IconX size={15} />
              </button>
            </div>
            <p className="mt-1 text-xs" style={{ color: panel.ink2 }}>
              依赖它的问题 {sel.dependents} 个 · 挂在它之下的概念 {sel.lower} 个
            </p>
            {sel.summary && <p className="mt-2 leading-relaxed">{stripWiki(sel.summary)}</p>}
            <Link href={`/concept/${sel.id}/`} className="mt-2 underline underline-offset-2" style={{ color: panel.link }}>
              打开专题 →
            </Link>
            {(neighbors.get(sel.id) ?? []).length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: panel.border }}>
                <div className="mb-1 text-[11px]" style={{ color: panel.ink2 }}>
                  相连的星
                </div>
                <ul className="space-y-1">
                  {(neighbors.get(sel.id) ?? []).map((nb, i) => (
                    <li key={`${nb.id}-${nb.type}-${i}`}>
                      <button className="flex items-center gap-1.5 text-left hover:underline" onClick={() => select(nb.id)}>
                        <span style={{ color: panel.ink2 }}>
                          {LINK_LABEL[nb.type]}
                          {nb.dir === "in" ? "（上游）" : ""}
                        </span>
                        {byId.get(nb.id)?.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        {(Object.keys(STAR_GROUP_LABEL) as StarGroup[]).map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: style.groups[g] }} />
            {STAR_GROUP_LABEL[g]}
          </span>
        ))}
        <span>星越大，越上位（依赖它的问题与下位概念越多）</span>
        <span>{style.darkSky ? "十字光芒" : "虚线外环"}为根据论 · 点状环为英美法系概念</span>
        <span>彗星从上位概念流向下位概念；功能对应、对称、对立双向流动</span>
        <span>材质：{style.name}</span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">以列表查看 {visible.links.length} 条关系</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {visible.links.map((l, i) => (
            <li key={i}>
              <span className="text-ink-2">{byId.get(l.source)?.label}</span>
              <span className="mx-1.5 text-ink-3">—{LINK_LABEL[l.type]}→</span>
              <span className="text-ink-2">{byId.get(l.target)?.label}</span>
              {l.description && <span className="text-ink-3">：{stripWiki(l.description)}</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  2D 星图                                                            */
/* ------------------------------------------------------------------ */

function StarCanvas2D({
  data,
  selected,
  onSelect,
  neighbors,
  reduced,
  flyRef,
  style,
  themeId,
}: {
  data: { nodes: StarNode[]; links: StarLink[] };
  selected: string | null;
  onSelect: (id: string | null) => void;
  neighbors: Map<string, { id: string }[]>;
  reduced: boolean;
  flyRef: FlyRef;
  style: StarStyle;
  themeId: ResolvedTheme;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<ForceGraphInstance<SN, SL> | null>(null);
  const objs = useRef(new Map<string, SN>());
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const neighborsRef = useRef(neighbors);
  neighborsRef.current = neighbors;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const styleRef = useRef(style);
  styleRef.current = style;
  const painterRef = useRef(createPainter(themeId));
  const [ready, setReady] = useState(false);

  // 初始化一次
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const { default: ForceGraph } = await import("force-graph");
      const { forceCollide, forceX, forceY } = await import("d3-force");
      if (disposed || !hostRef.current) return;
      const host = hostRef.current;
      const centers = constellationCenters([...AREA_ORDER]);
      const painter = painterRef.current;
      let last = performance.now();
      const focusOf = () => hoverRef.current ?? selectedRef.current;
      const nearOf = (focus: string | null) => (focus ? new Set((neighborsRef.current.get(focus) ?? []).map((n) => n.id)) : null);
      const fg = new ForceGraph<SN, SL>(host)
        .backgroundColor("rgba(0,0,0,0)")
        .width(host.clientWidth)
        .height(host.clientHeight)
        .nodeId("id")
        .nodeLabel(() => "")
        .nodeCanvasObject((n, ctx, scale) => drawStar(ctx, n, styleRef.current, painter, reducedRef.current ? 0 : performance.now(), scale, focusOf() === n.id, reducedRef.current))
        .nodePointerAreaPaint((n, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, Math.max(n.r, 5) * 1.6, 0, Math.PI * 2);
          ctx.fill();
        })
        .linkCanvasObjectMode(() => "replace")
        .linkCanvasObject((l, ctx, scale) => drawLink(ctx, l, styleRef.current, painter, performance.now(), scale, reducedRef.current))
        .autoPauseRedraw(false)
        .onNodeHover((n) => {
          hoverRef.current = n?.id ?? null;
          host.style.cursor = n ? "pointer" : "grab";
        })
        .onNodeClick((n) => {
          onSelectRef.current(n.id);
          fly(n.id);
        })
        .onBackgroundClick(() => onSelectRef.current(null))
        .onZoom(({ x, y }) => {
          // 背景星空随平移轻微移动，形成视差
          if (bgRef.current) bgRef.current.style.transform = `translate(${(x * 0.06) % 200}px, ${(y * 0.06) % 200}px)`;
        })
        .onRenderFramePre((ctx, scale) => {
          const now = performance.now();
          const dt = Math.min(64, now - last);
          last = now;
          const { nodes, links } = fg.graphData();
          const focus = focusOf();
          updateFocus(painter, nodes, links, focus, nearOf(focus), dt, reducedRef.current);
          drawHaze(ctx, nodes, styleRef.current);
          drawConstellations(ctx, scale, nodes, styleRef.current);
        })
        .onRenderFramePost((ctx, scale) => {
          const focus = focusOf();
          drawLabels(ctx, fg.graphData().nodes, styleRef.current, painter, scale, focus, nearOf(focus));
        })
        .d3VelocityDecay(0.32)
        .cooldownTicks(260)
        .minZoom(0.25)
        .maxZoom(8);

      fg.d3Force("charge")?.strength((n: SN) => -60 - n.r * 14);
      const link = fg.d3Force("link") as unknown as { distance: (f: (l: SL) => number) => unknown; strength: (f: (l: SL) => number) => unknown } | undefined;
      link?.distance((l) => (l.type === "prereq" ? 90 : 70));
      link?.strength((l) => (l.type === "prereq" ? 0.03 : 0.08));
      fg.d3Force("x", forceX<SN>((n) => centers.get(n.area)?.x ?? 0).strength(0.07) as never);
      fg.d3Force("y", forceY<SN>((n) => centers.get(n.area)?.y ?? 0).strength(0.07) as never);
      fg.d3Force("collide", forceCollide<SN>((n) => n.r * 2.4 + 10) as never);

      let first = true;
      fg.onEngineStop(() => {
        if (first) {
          first = false;
          fg.zoomToFit(700, 50);
        }
      });

      const fly = (id: string) => {
        const n = objs.current.get(id);
        if (!n || n.x == null || n.y == null) return;
        fg.centerAt(n.x, n.y, 700);
        fg.zoom(Math.max(2.2, fg.zoom()), 700);
      };
      flyRef.current = fly;
      fgRef.current = fg;
      ro = new ResizeObserver(() => {
        fg.width(host.clientWidth).height(host.clientHeight);
        if (bgRef.current) paintSky(bgRef.current, styleRef.current, painterRef.current.theme);
      });
      ro.observe(host);
      if (bgRef.current) paintSky(bgRef.current, styleRef.current, themeId);
      setReady(true);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      fgRef.current?._destructor();
      fgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 换主题：丢掉旧贴图、重画天空，星的位置不动
  useEffect(() => {
    setPainterTheme(painterRef.current, themeId);
    if (bgRef.current) paintSky(bgRef.current, style, themeId);
  }, [themeId, style]);

  // 数据变化时复用已有的节点对象，保留位置，避免整张图重新散开
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const nodes = data.nodes.map((n) => {
      const o = objs.current.get(n.id);
      if (o) return Object.assign(o, n);
      const fresh = { ...n } as SN;
      objs.current.set(n.id, fresh);
      return fresh;
    });
    fg.graphData({ nodes, links: data.links.map((l) => ({ ...l })) as SL[] });
  }, [data, ready]);

  useEffect(() => {
    fgRef.current?.autoPauseRedraw(reduced);
  }, [reduced]);

  return (
    <div className="relative" style={{ height: "clamp(480px, 74vh, 860px)" }}>
      <canvas ref={bgRef} className="pointer-events-none absolute -inset-[200px] h-[calc(100%+400px)] w-[calc(100%+400px)]" aria-hidden />
      <div ref={hostRef} className="absolute inset-0" role="img" aria-label="概念繁星图：星越大越上位，连线上的彗星从上位概念流向下位概念" />
    </div>
  );
}

/** 星座名：放在每个体系位置的星群上方 */
function drawConstellations(ctx: CanvasRenderingContext2D, scale: number, nodes: SN[], style: StarStyle) {
  const groups = new Map<Area, SN[]>();
  for (const n of nodes) if (n.x != null) groups.set(n.area, [...(groups.get(n.area) ?? []), n]);
  for (const [area, ns] of groups) {
    if (ns.length < 2) continue;
    const cx = ns.reduce((s, n) => s + n.x!, 0) / ns.length;
    const top = Math.min(...ns.map((n) => n.y! - n.r * 3));
    drawConstellationName(ctx, CONSTELLATION_LABEL[area], cx, top - 8 / scale, scale, style);
  }
}
