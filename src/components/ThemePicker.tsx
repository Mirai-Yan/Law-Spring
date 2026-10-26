"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readLocal, setSynced, SYNC_EVENT } from "@/lib/account";
import { normalizeThemePref, resolveTheme, THEME_COLOR, THEME_EVENT, THEME_KEY, THEMES, type ThemePref } from "@/lib/theme";
import { IconCheck } from "./icons";

function readPref(): ThemePref {
  try {
    return normalizeThemePref(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

/** 把主题应用到页面，并通知画布类组件（Cytoscape 等）重新取色 */
export function applyTheme(pref: ThemePref) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const t = resolveTheme(pref, systemDark);
  const d = document.documentElement;
  d.dataset.theme = t;
  d.dataset.themePref = pref;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[t];
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { pref, theme: t } }));
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* 无法保存时只在本次生效 */
  }
  applyTheme(pref);
}

export default function ThemePicker() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const p = readPref();
    setPref(p);
    applyTheme(p);
    // 旧主题名（如「羊皮纸」）就地改写为新名
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw && raw !== p && p !== "system") localStorage.setItem(THEME_KEY, p);
    } catch {
      /* 忽略 */
    }
    // 「跟随系统」时，系统切换深浅色要跟着变
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => readPref() === "system" && applyTheme("system");
    mq.addEventListener("change", onSystem);
    // 其他标签页改了主题，这里同步
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      const next = normalizeThemePref(e.newValue);
      setPref(next);
      applyTheme(next);
    };
    window.addEventListener("storage", onStorage);
    // 登录后从服务器拉到了其他设备上选的主题
    const onSync = (e: Event) => {
      if ((e as CustomEvent).detail?.key !== "theme") return;
      const raw = readLocal<string>("theme")?.value;
      const v = raw == null ? null : normalizeThemePref(raw);
      if (v && v !== readPref()) {
        setPref(v);
        setThemePref(v);
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      mq.removeEventListener("change", onSystem);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    const i = THEMES.findIndex((t) => t.id === pref);
    itemRefs.current[Math.max(0, i)]?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, pref]);

  const choose = useCallback((p: ThemePref) => {
    setPref(p);
    setThemePref(p);
    setSynced("theme", p);
    setOpen(false);
  }, []);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
  };

  const current = THEMES.find((t) => t.id === pref) ?? THEMES[0];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="btn !px-2.5 !py-1 !text-[13px]"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="切换界面主题"
      >
        <Ramp colors={current.ramp} />
        <span className="hidden sm:inline">{current.label}</span>
        <span className="sr-only sm:hidden">主题：{current.label}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="界面主题"
          onKeyDown={onMenuKey}
          className="card absolute right-0 top-full z-50 mt-2 w-60 p-1.5"
          style={{ boxShadow: "var(--elev-3)" }}
        >
          {GROUPS.map((g) => (
            <div key={g.tone} role="group" aria-label={g.label}>
              {g.label && <div className="px-2.5 pb-1 pt-2 text-[11px] tracking-[0.14em] text-ink-3">{g.label}</div>}
              {THEMES.map((t, i) =>
                t.tone !== g.tone ? null : (
                  <button
                    key={t.id}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={pref === t.id}
                    onClick={() => choose(t.id)}
                    className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2"
                  >
                    <Ramp colors={t.ramp} />
                    <span className="flex-1">{t.label}</span>
                    <span className="text-accent-ink">{pref === t.id && <IconCheck size={15} />}</span>
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GROUPS = [
  { tone: "auto", label: "" },
  { tone: "light", label: "浅色" },
  { tone: "dark", label: "深色" },
] as const;

/** 色阶条：页面底、侧栏、主强调、次级强调、主文字 */
function Ramp({ colors }: { colors: readonly string[] }) {
  return (
    <span aria-hidden className="flex h-5 w-12 shrink-0 overflow-hidden rounded-[6px]" style={{ boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.12)" }}>
      {colors.map((c, i) => (
        <span key={i} style={{ background: c, flex: i < 2 ? 2 : 1 }} />
      ))}
    </span>
  );
}
