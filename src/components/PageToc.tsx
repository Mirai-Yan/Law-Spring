"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TocItem = { id: string; label: string };

/** 顶栏高度 + 一点留白：判断「当前在哪一节」的基准线 */
const OFFSET = 96;

/**
 * 页内目录：电脑宽度是左侧吸顶的竖排列表，手机宽度是顶栏下方的一条可展开细栏。
 * 当前所在的一节高亮；点过的项保持强调色，与没点过的项区分。
 */
export default function PageToc({ items, title = "本页目录" }: { items: TocItem[]; title?: string }) {
  const [present, setPresent] = useState<TocItem[]>(items);
  const [active, setActive] = useState<string | undefined>(items[0]?.id);
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const lockUntil = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);

  // 有些区块只在客户端出现（如登录后才有的「我的资料」），目录只列页面上实际存在的
  const refresh = useCallback(() => {
    const now = items.filter((i) => document.getElementById(i.id));
    setPresent((p) => (p.length === now.length && p.every((x, k) => x.id === now[k].id) ? p : now));
    return now;
  }, [items]);

  useEffect(() => {
    let raf = 0;
    const spy = () => {
      raf = 0;
      const list = refresh();
      if (!list.length || Date.now() < lockUntil.current) return;
      let cur = list[0].id;
      for (const it of list) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top - OFFSET <= 0) cur = it.id;
      }
      // 滚到底时最后一节可能够不到基准线
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = list[list.length - 1].id;
      setActive(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(spy);
    };
    spy();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // 客户端区块加载完成后再核对一次
    const t = window.setTimeout(spy, 1500);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [refresh]);

  // 手机目录：点外面或按 Esc 收起
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const go = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setActive(id);
    setVisited((v) => new Set(v).add(id));
    setOpen(false);
    // 滚动途中暂停跟随，免得点中的那一项被经过的小节抢走高亮
    lockUntil.current = Date.now() + 1200;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const release = () => {
      lockUntil.current = 0;
      window.removeEventListener("scrollend", release);
    };
    window.addEventListener("scrollend", release);
    window.history.replaceState(null, "", `#${id}`);
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  };

  if (present.length < 2) return <aside aria-hidden className="hidden lg:block" />;
  const activeLabel = present.find((i) => i.id === active)?.label ?? present[0].label;

  const list = (
    <ol className="toc-list">
      {present.map((it) => (
        <li key={it.id}>
          <a
            href={`#${it.id}`}
            onClick={(e) => go(e, it.id)}
            className="toc-link"
            aria-current={active === it.id ? "location" : undefined}
            data-visited={visited.has(it.id) || undefined}
          >
            {it.label}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <aside className="toc-aside">
      {/* 手机：顶栏下方的细栏 */}
      <div ref={barRef} className="toc-bar lg:hidden">
        <button className="flex w-full items-center gap-2 py-2 text-left text-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="shrink-0 text-ink-3">{title}</span>
          <span aria-hidden className="text-ink-3">·</span>
          <span className="min-w-0 flex-1 truncate font-medium text-accent-ink">{activeLabel}</span>
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <nav aria-label={title} className="card absolute inset-x-0 top-full mt-1 max-h-[60vh] overflow-y-auto p-2">
            {list}
          </nav>
        )}
      </div>
      {/* 电脑：左侧吸顶 */}
      <nav aria-label={title} className="toc-side hidden lg:block">
        <div className="eyebrow mb-2 pl-3">{title}</div>
        {list}
      </nav>
    </aside>
  );
}
