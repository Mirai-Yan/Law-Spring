"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { aiPost } from "@/lib/ai/client";
import type { TutorPage, TutorRef } from "@/lib/ai/tutor";
import { TUTOR_EVENT, askTutor, type TutorAsk } from "@/lib/tutor-client";
import Term from "./Term";
import { IconAlert, IconSend, IconSparkle, IconX } from "./icons";

type Msg = {
  role: "user" | "assistant";
  content: string;
  refs?: TutorRef[];
  followups?: string[];
  warnings?: string[];
  error?: boolean;
};
type Reply = { source: "ai" | "cache"; model: string; context?: string; result: { answer: string; refs: TutorRef[]; followups: string[]; warnings: string[] } };

const STORE = "fm-tutor";
const SUGGEST: Record<TutorPage["kind"] | "none", string[]> = {
  question: ["这道题到底在争什么？", "为什么要先回答那些先决问题？", "用一个例子帮我理解各说的分歧"],
  concept: ["这个专题从哪里学起？", "这个专题和哪些问题联系最紧？", "用一个例子说明它的核心争议"],
  crime: ["这个罪的保护法益是什么意思？", "它和相近的罪怎么区分？", "举个例子说明要件怎么用"],
  none: ["结果无价值和行为无价值有什么区别？", "构成要件、违法性、有责性分别管什么？", "学刑法总论应该从哪里开始？"],
};

/** 由当前路径推断页面：问题、专题、罪名 */
function pageOf(path: string): TutorPage | undefined {
  const m = /^\/(question|concept|crime)\/([^/]+)\/?$/.exec(path);
  return m ? { kind: m[1] as TutorPage["kind"], id: decodeURIComponent(m[2]) } : undefined;
}

function load(): Msg[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as Msg[];
  } catch {
    return [];
  }
}

/** AI 助教：右下角的入口、右侧（手机上是底部）的对话面板、划词提问的小气泡 */
export default function Tutor() {
  const path = usePathname();
  const page = pageOf(path);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [useCtx, setUseCtx] = useState(true);
  const [title, setTitle] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMsgs(load()), []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* 无法保存时只在本页保留 */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  // 换页后重新带上新页面的上下文
  useEffect(() => {
    setUseCtx(true);
    const t = window.setTimeout(() => setTitle(document.title.split(" · ")[0]), 300);
    return () => window.clearTimeout(t);
  }, [path]);

  const send = useCallback(
    async (text: string, hint?: string) => {
      const q = text.trim();
      if (!q || busy) return;
      const user: Msg = { role: "user", content: hint ? `${q}\n（${hint}）` : q };
      const history = [...msgs.filter((m) => !m.error), user].slice(-12).map((m) => ({ role: m.role, content: m.content }));
      setMsgs((m) => [...m, user]);
      setInput("");
      setBusy(true);
      const r = await aiPost<Reply>("/api/tutor/", { messages: history, page: useCtx ? page : undefined });
      setBusy(false);
      setMsgs((m) => [
        ...m,
        r.ok
          ? { role: "assistant", content: r.data.result.answer, refs: r.data.result.refs, followups: r.data.result.followups, warnings: r.data.result.warnings }
          : { role: "assistant", content: r.error, error: true },
      ]);
    },
    [busy, msgs, page, useCtx],
  );

  // 页面上任何地方都可以唤起：词条浮层、导引各步、划词气泡
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<TutorAsk>).detail;
      setOpen(true);
      if (d.send) send(d.text, d.hint);
      else {
        setInput(d.text);
        window.setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    window.addEventListener(TUTOR_EVENT, on);
    return () => window.removeEventListener(TUTOR_EVENT, on);
  }, [send]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".term-pop,.term-sheet") && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const kind = useCtx && page ? page.kind : "none";

  return (
    <>
      <SelectionAsk disabled={busy} />
      {!open && (
        <button className="tutor-fab btn btn-primary" onClick={() => setOpen(true)} aria-label="打开 AI 助教">
          <IconSparkle size={16} />
          问 AI
        </button>
      )}
      {open && (
        <aside className="tutor-panel" aria-label="AI 助教">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <IconSparkle size={16} className="text-accent-ink" />
            <h2 className="font-serif text-base font-semibold">AI 助教</h2>
            <span className="text-xs text-ink-3">不懂就问，随时可以追问</span>
            <div className="ml-auto flex items-center gap-1">
              {msgs.length > 0 && (
                <button className="rounded-md px-2 py-1 text-xs text-ink-3 hover:bg-surface-2 hover:text-ink" onClick={() => setMsgs([])}>
                  清空对话
                </button>
              )}
              <button className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="关闭 AI 助教" onClick={() => setOpen(false)}>
                <IconX size={18} />
              </button>
            </div>
          </header>

          {page && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
              {useCtx ? (
                <>
                  <span className="text-ink-3">正在看：</span>
                  <span className="chip min-w-0 max-w-full !text-ink">
                    <span className="truncate">{title || "当前页面"}</span>
                    <button className="-mr-1 text-ink-3 hover:text-ink" aria-label="不带上当前页面" onClick={() => setUseCtx(false)}>
                      <IconX size={12} />
                    </button>
                  </span>
                </>
              ) : (
                <button className="link" onClick={() => setUseCtx(true)}>
                  带上当前页面「{title || "当前页面"}」一起问
                </button>
              )}
            </div>
          )}

          <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-3 text-sm">
                <p className="text-ink-2">
                  看不懂的词、想不通的推理，都可以直接问。{page ? "回答会优先依据本页的知识库内容。" : ""}也可以在正文里选中一段文字，点旁边的「问 AI」。
                </p>
                <div className="flex flex-col items-start gap-2">
                  {SUGGEST[kind].map((s) => (
                    <button key={s} className="tutor-chip" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <Bubble key={i} m={m} last={i === msgs.length - 1} onFollow={(q) => send(q)} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-ink-3">
                <span className="tutor-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                正在思考…
              </div>
            )}
          </div>

          <form
            className="border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="tutor-input" className="sr-only">
              向 AI 助教提问
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="tutor-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={2}
                maxLength={800}
                placeholder="输入问题，Enter 发送，Shift+Enter 换行"
                className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none"
              />
              <button className="btn btn-primary !px-3" disabled={busy || !input.trim()} aria-label="发送">
                <IconSend size={16} />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-3">AI 解答未经核实，仅供理解；结论以知识库中「已核实」的内容和原始文献为准。</p>
          </form>
        </aside>
      )}
    </>
  );
}

function Bubble({ m, last, onFollow }: { m: Msg; last: boolean; onFollow: (q: string) => void }) {
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-sm text-ink">{m.content}</p>
      </div>
    );
  if (m.error)
    return (
      <p className="flex items-start gap-1.5 text-sm text-ink-3" role="alert">
        <IconAlert size={14} className="mt-0.5" />
        没能回答：{m.content}
      </p>
    );
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-ink-3">AI 解答 · 未经核实，仅供理解</div>
      <div className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-ink">{m.content}</div>
      {m.warnings?.map((w, i) => (
        <p key={i} className="flex items-start gap-1 text-xs text-ink-3">
          <IconAlert size={13} className="mt-0.5" />
          {w}
        </p>
      ))}
      {m.refs && m.refs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-3">相关：</span>
          {m.refs.map((r) =>
            r.kind === "term" ? (
              <span key={r.id} className="chip">
                <Term t={r.term} />
              </span>
            ) : (
              <Link key={r.id} href={r.href} className="chip max-w-full hover:bg-surface-2">
                <span className="truncate">{r.label}</span>
              </Link>
            ),
          )}
        </div>
      )}
      {last && m.followups && m.followups.length > 0 && (
        <div className="flex flex-col items-start gap-1.5 pt-1">
          {m.followups.map((f) => (
            <button key={f} className="tutor-chip" onClick={() => onFollow(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 在正文里选中一小段文字时，旁边浮出「问 AI」 */
function SelectionAsk({ disabled }: { disabled: boolean }) {
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    let t = 0;
    const check = () => {
      const s = window.getSelection();
      const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!s || s.rangeCount === 0 || text.length < 2 || text.length > 60) return setSel(null);
      const node = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
      // 只在正文里出现；输入框、助教面板、浮层里不出现
      if (!node?.closest("main") || node.closest("input,textarea,[contenteditable],.tutor-panel,.term-pop,.term-sheet")) return setSel(null);
      const r = s.getRangeAt(0).getBoundingClientRect();
      if (!r.width && !r.height) return setSel(null);
      const touch = window.matchMedia("(pointer: coarse)").matches;
      // 触屏上系统菜单在选区上方，气泡放到下方
      setSel({ text, x: Math.min(Math.max(8, r.left + r.width / 2 - 44), window.innerWidth - 96), y: touch ? r.bottom + 10 : Math.max(8, r.top - 42) });
    };
    const onChange = () => {
      window.clearTimeout(t);
      t = window.setTimeout(check, 250);
    };
    const hide = () => setSel(null);
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", hide);
      window.clearTimeout(t);
    };
  }, []);

  if (!sel || disabled) return null;
  return (
    <button
      className="tutor-sel btn !px-2.5 !py-1 !text-[13px]"
      style={{ left: sel.x, top: sel.y }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        askTutor({ text: `“${sel.text}”是什么意思？在这里起什么作用？`, send: true });
        window.getSelection()?.removeAllRanges();
        setSel(null);
      }}
    >
      <IconSparkle size={14} />
      问 AI
    </button>
  );
}
