"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TermLite } from "@/lib/glossary";
import { askTutor } from "@/lib/tutor-client";
import { IconSparkle, IconX } from "./icons";
import { StatusBadge } from "./ui";

const W = 320;

/** 带虚下划线的基础词条：点开看释义，还不懂可以直接问 AI 助教 */
export default function Term({ t, children }: { t: TermLite; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const [sheet, setSheet] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  // 电脑上贴在词的下方（放不下就翻到上方）；手机上改为底部抽屉
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const narrow = window.innerWidth < 640;
    setSheet(narrow);
    if (narrow) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const left = Math.min(Math.max(12, r.left), window.innerWidth - W - 12);
    const below = window.innerHeight - r.bottom > 280 || r.top < 280;
    setPos(below ? { left, top: r.bottom + 6 } : { left, bottom: window.innerHeight - r.top + 6 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!pop.current?.contains(n) && !btn.current?.contains(n)) close(false);
    };
    // 浮层是固定定位的，页面一滚就对不上词了，所以收起；抽屉不受影响
    const onScroll = () => !sheet && close(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, sheet, close]);

  const orig = [t.original?.de, t.original?.ja, t.original?.en].filter(Boolean).join(" · ");

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="term"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {children ?? t.term}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={`释义：${t.term}`}
            className={sheet ? "term-sheet" : "term-pop"}
            style={sheet ? undefined : { ...pos, width: W }}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-serif text-lg font-semibold leading-snug">{t.term}</div>
                {orig && <div className="mt-0.5 text-xs text-ink-3">{orig}</div>}
              </div>
              <StatusBadge item={t} compact />
              <button className="-mr-1 rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="关闭" onClick={() => close()}>
                <IconX size={16} />
              </button>
            </div>
            <p className="mt-2 font-medium text-ink">{t.short}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.definition}</p>
            <p className="mt-2 text-xs text-ink-3">编者的概括，不是原文。</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <button
                className="btn !px-2.5 !py-1 !text-[13px]"
                onClick={() => {
                  close(false);
                  askTutor({ text: `「${t.term}」是什么意思？在这里起什么作用？`, send: true });
                }}
              >
                <IconSparkle size={14} />
                还不懂？问 AI
              </button>
              {t.concept && (
                <Link href={`/concept/${t.concept}/`} className="link ml-auto text-sm">
                  看专题{t.conceptName ? `「${t.conceptName}」` : ""} →
                </Link>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
