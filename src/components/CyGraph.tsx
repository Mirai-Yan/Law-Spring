"use client";

import { useEffect, useRef } from "react";
import type { Core, ElementDefinition, LayoutOptions, Stylesheet } from "cytoscape";
import { THEME_EVENT } from "@/lib/theme";

export type CssVars = (name: string) => string;

/** Cytoscape 画布：颜色从 CSS 令牌读取，切换主题时重新着色 */
export default function CyGraph({
  elements,
  style,
  layout,
  height = 520,
  onNodeTap,
  ariaLabel,
}: {
  elements: ElementDefinition[];
  style: (v: CssVars) => Stylesheet[];
  layout: LayoutOptions;
  height?: number;
  onNodeTap?: (id: string) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const tapRef = useRef(onNodeTap);
  tapRef.current = onNodeTap;

  useEffect(() => {
    let disposed = false;
    let restyle: (() => void) | null = null;
    const vars: CssVars = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (layout.name === "dagre") {
        const dagre = (await import("cytoscape-dagre")).default;
        try {
          cytoscape.use(dagre);
        } catch {
          /* 已注册 */
        }
      }
      if (disposed || !ref.current) return;
      const cy = cytoscape({
        container: ref.current,
        elements,
        style: style(vars),
        layout,
        wheelSensitivity: 0.25,
        minZoom: 0.3,
        maxZoom: 2.5,
      });
      // 节点很少时自动适配会放得过大，限制一下
      if (cy.zoom() > 1.3) {
        cy.zoom(1.3);
        cy.center();
      }
      cy.on("tap", "node", (e) => tapRef.current?.(e.target.id()));
      cy.on("mouseover", "node", () => ref.current && (ref.current.style.cursor = "pointer"));
      cy.on("mouseout", "node", () => ref.current && (ref.current.style.cursor = "default"));
      cyRef.current = cy;
      if (process.env.NODE_ENV === "development") (window as unknown as { __cy?: Core }).__cy = cy;

      // 主题切换（含「跟随系统」时系统切换深浅色）都会发出这个事件
      restyle = () => cy.style(style(vars));
      window.addEventListener(THEME_EVENT, restyle);
    })();

    return () => {
      disposed = true;
      if (restyle) window.removeEventListener(THEME_EVENT, restyle);
      const cy = cyRef.current;
      cy?.destroy();
      cyRef.current = null;
    };
    // elements/layout 变化时整体重建；style 函数按约定是稳定的
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, layout]);

  return (
    <div className="relative">
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-border bg-surface"
        style={{ height }}
      />
      <div className="pointer-events-none absolute bottom-2 right-3 text-xs text-ink-3">滚轮缩放 · 拖动平移 · 点击节点打开</div>
    </div>
  );
}
