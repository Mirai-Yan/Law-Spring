"use client";

import { Children, useEffect, useState, type ReactNode } from "react";

/**
 * 标签页：当前页记在 ?tab= 中，方便分享链接；面板内容由服务端预先渲染。
 * vertical：电脑宽度下标签栏移到左侧竖排（与页内目录同一套样式），手机上仍是横排。
 */
export default function Tabs({
  tabs,
  children,
  vertical = false,
}: {
  tabs: { id: string; label: string }[];
  children: ReactNode;
  vertical?: boolean;
}) {
  const [active, setActive] = useState(tabs[0].id);
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const panels = Children.toArray(children);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && tabs.some((x) => x.id === t)) setActive(t);
  }, [tabs]);

  const select = (id: string) => {
    setActive(id);
    setVisited((v) => new Set(v).add(id));
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.hash = "";
    window.history.replaceState(null, "", url.toString());
  };

  const horizontal = (
    <div role="tablist" className={`no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 ${vertical ? "lg:hidden" : ""}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => select(t.id)}
          className={`shrink-0 border-b-2 px-3 py-2 text-sm ${
            active === t.id ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // 只挂载当前面板：图谱类组件在隐藏容器里初始化会得到零尺寸
  const panel = (
    <div key={active} role="tabpanel">
      {panels[Math.max(0, tabs.findIndex((t) => t.id === active))]}
    </div>
  );

  if (!vertical)
    return (
      <div>
        {horizontal}
        {panel}
      </div>
    );

  return (
    <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
      <div>
        {horizontal}
        <nav aria-label="本页栏目" className="toc-side hidden lg:block">
          <div className="eyebrow mb-2 pl-3">本页栏目</div>
          <div role="tablist" aria-orientation="vertical" className="toc-list">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={active === t.id}
                aria-current={active === t.id ? "location" : undefined}
                data-visited={visited.has(t.id) || undefined}
                onClick={() => select(t.id)}
                className="toc-link w-full text-left"
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
      <div className="min-w-0">{panel}</div>
    </div>
  );
}
