"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/account";
import { libFetch, type Card, type DocMeta, type QuestionRef } from "@/lib/library-client";
import { IconAlert, IconSparkle } from "./icons";

type PageData = { doc: DocMeta; page: number; text: string; cards: Card[] };

/** 阅读页：按页读原文；选中文字存成卡片（自动带文件名和页码），可加批注、关联库内问题 */
function Inner({ questions }: { questions: QuestionRef[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useUser();
  const docId = Number(sp.get("doc"));
  const page = Number(sp.get("page")) || 1;
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    libFetch<PageData>(`/api/library/page/?doc=${docId}&page=${page}`).then(setData, (e) => setError(e.message));
  }, [docId, page]);
  useEffect(() => {
    if (user && docId) load();
  }, [user, docId, load]);

  // 跟踪页面正文里的选区
  useEffect(() => {
    const on = () => {
      const s = window.getSelection();
      const inside = s && s.rangeCount > 0 && textRef.current?.contains(s.getRangeAt(0).commonAncestorContainer);
      setSel(inside ? s!.toString().trim() : "");
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);

  const go = (p: number) => {
    setDraft(null);
    router.replace(`${pathname}?doc=${docId}&page=${p}`, { scroll: false });
    window.scrollTo({ top: 0 });
  };

  if (!ready) return null;
  if (!user)
    return (
      <p className="card p-5 text-sm">
        请先<Link href={`/login/?next=${encodeURIComponent(`/library/read/?doc=${docId}&page=${page}`)}`} className="link">登录</Link>。
      </p>
    );
  if (error) return <p className="card p-5 text-sm">{error}</p>;
  if (!data) return <p className="text-ink-3">加载中…</p>;

  const { doc, text, cards } = data;
  const here = cards.filter((c) => c.page === data.page);
  const qText = new Map(questions.map((q) => [q.id, q.text]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/library/" className="link text-sm">
          ← 我的资料库
        </Link>
        <h1 className="font-serif text-xl font-bold">{doc.title}</h1>
      </div>
      <Pager page={data.page} pages={doc.pages} go={go} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="card p-5">
          <div ref={textRef} className="whitespace-pre-wrap font-serif text-[15px] leading-[1.9]">
            <Marked text={text} quotes={here.map((c) => c.quote)} />
          </div>
          {!text && <p className="text-ink-3">这一页没有文字。</p>}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {draft !== null ? (
            <CardForm
              quote={draft}
              questions={questions}
              onCancel={() => setDraft(null)}
              onSave={async (note, question) => {
                await libFetch("/api/library/cards/", { method: "POST", json: { docId, page: data.page, quote: draft, note, question } });
                setDraft(null);
                window.getSelection()?.removeAllRanges();
                load();
              }}
            />
          ) : (
            <div className="card space-y-2 p-4 text-sm">
              <p className="text-ink-2">{sel ? `已选中 ${sel.length} 字` : "在左侧选中一段文字，可以存成卡片。"}</p>
              <button className="btn btn-primary w-full" disabled={sel.length < 4} onClick={() => setDraft(sel.slice(0, 2000))}>
                存为卡片
              </button>
              <Related text={sel.length >= 10 ? sel : text} label={sel.length >= 10 ? "为选中的段落推荐库内问题" : "为这一页推荐库内问题"} />
            </div>
          )}

          <section>
            <h2 className="section-title mb-2 !text-base">本书卡片（{cards.length}）</h2>
            <ul className="space-y-2">
              {cards.map((c) => (
                <CardItem key={c.id} card={c} current={c.page === data.page} qText={qText} questions={questions} onGo={() => go(c.page)} onChange={load} />
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <Pager page={data.page} pages={doc.pages} go={go} />
    </div>
  );
}

function Pager({ page, pages, go }: { page: number; pages: number; go: (p: number) => void }) {
  const [v, setV] = useState(String(page));
  useEffect(() => setV(String(page)), [page]);
  return (
    <nav aria-label="翻页" className="flex flex-wrap items-center gap-2 text-sm">
      <button className="btn" disabled={page <= 1} onClick={() => go(page - 1)}>
        ← 上一页
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Math.min(Math.max(1, Number(v) || 1), pages);
          go(n);
        }}
        className="flex items-center gap-1"
      >
        第
        <input value={v} onChange={(e) => setV(e.target.value)} inputMode="numeric" aria-label="页码" className="w-14 rounded-md border border-border bg-surface px-2 py-1 text-center" />/ {pages} 页
      </form>
      <button className="btn" disabled={page >= pages} onClick={() => go(page + 1)}>
        下一页 →
      </button>
    </nav>
  );
}

/** 把本页已存卡片的摘录在正文里标出来 */
function Marked({ text, quotes }: { text: string; quotes: string[] }) {
  const ranges: [number, number][] = [];
  for (const q of quotes) {
    const i = text.indexOf(q);
    if (i >= 0) ranges.push([i, i + q.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([s, e], k) => {
    if (s < at) return;
    out.push(text.slice(at, s));
    out.push(
      <mark key={k} className="rounded-sm bg-[var(--accent-soft)] text-ink">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  out.push(text.slice(at));
  return <>{out}</>;
}

function QuestionSelect({ value, onChange, questions }: { value: string; onChange: (v: string) => void; questions: QuestionRef[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm">
      <option value="">不关联问题</option>
      {questions.map((q) => (
        <option key={q.id} value={q.id}>
          {q.text}
        </option>
      ))}
    </select>
  );
}

function CardForm({ quote, questions, onSave, onCancel }: { quote: string; questions: QuestionRef[]; onSave: (note: string, question: string) => Promise<void>; onCancel: () => void }) {
  const [note, setNote] = useState("");
  const [question, setQuestion] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="card space-y-3 p-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSave(note, question);
        } catch (x) {
          setErr((x as Error).message);
        }
      }}
    >
      <blockquote className="max-h-40 overflow-auto border-l-2 border-border pl-3 font-serif text-ink-2">{quote}</blockquote>
      <label className="block">
        <span className="mb-1 block text-ink-2">批注（选填）</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className="w-full rounded-lg border border-border bg-surface px-3 py-2" />
      </label>
      <label className="block">
        <span className="mb-1 block text-ink-2">关联到库内问题（选填）</span>
        <QuestionSelect value={question} onChange={setQuestion} questions={questions} />
      </label>
      <Related text={quote} label="推荐相关问题" onPick={setQuestion} />
      {err && <p className="text-ink-3"><IconAlert size={13} className="mr-1 inline-block shrink-0 align-[-0.15em]" />{err}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary">保存卡片</button>
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

/** 推荐相关的库内问题：问题 id 在服务器端逐一对照知识库校验 */
function Related({ text, label, onPick }: { text: string; label: string; onPick?: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ via: string; questions: QuestionRef[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setOut(null), [text]);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="btn w-full !text-[13px]"
        disabled={busy || text.trim().length < 10}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            setOut(await libFetch("/api/library/related/", { method: "POST", json: { text } }));
          } catch (e) {
            setErr((e as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? "查找中…" : <><IconSparkle size={14} />{label}</>}
      </button>
      {err && <p className="text-xs text-ink-3"><IconAlert size={13} className="mr-1 inline-block shrink-0 align-[-0.15em]" />{err}</p>}
      {out && (
        <div className="text-xs">
          <p className="text-ink-3">{out.via === "ai" ? "大模型推荐（只从库内问题中选）" : "关键词检索推荐"}：</p>
          {out.questions.length === 0 && <p className="text-ink-3">没有找到相关问题。</p>}
          <ul className="mt-1 space-y-1">
            {out.questions.map((q) => (
              <li key={q.id} className="flex items-start gap-1.5">
                {onPick && (
                  <button type="button" className="chip shrink-0 hover:bg-surface-2" onClick={() => onPick(q.id)}>
                    关联
                  </button>
                )}
                <Link href={`/question/${q.id}/`} className="link" target={onPick ? "_blank" : undefined}>
                  {q.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CardItem({
  card,
  current,
  qText,
  questions,
  onGo,
  onChange,
}: {
  card: Card;
  current: boolean;
  qText: Map<string, string>;
  questions: QuestionRef[];
  onGo: () => void;
  onChange: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(card.note ?? "");
  const [question, setQuestion] = useState(card.question ?? "");
  return (
    <li className={`card p-3 text-sm ${current ? "ring-1 ring-[var(--accent)]" : ""}`}>
      <button onClick={onGo} className="block w-full text-left">
        <span className="text-xs text-ink-3">第 {card.page} 页</span>
        <blockquote className="mt-0.5 line-clamp-4 border-l-2 border-border pl-2 font-serif text-ink-2">{card.quote}</blockquote>
      </button>
      {edit ? (
        <div className="mt-2 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} aria-label="批注" className="w-full rounded-lg border border-border bg-surface px-2 py-1.5" />
          <QuestionSelect value={question} onChange={setQuestion} questions={questions} />
          <div className="flex gap-2">
            <button
              className="btn !text-[13px]"
              onClick={async () => {
                await libFetch("/api/library/cards/", { method: "PATCH", json: { id: card.id, note, question } }).catch((e) => alert(e.message));
                setEdit(false);
                onChange();
              }}
            >
              保存
            </button>
            <button className="btn !text-[13px]" onClick={() => setEdit(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          {card.note && <p className="mt-1.5">{card.note}</p>}
          {card.question && (
            <Link href={`/question/${card.question}/`} className="link mt-1 block text-xs">
              → {qText.get(card.question) ?? card.question}
            </Link>
          )}
          <div className="mt-2 flex gap-3 text-xs">
            <button className="link" onClick={() => setEdit(true)}>
              编辑
            </button>
            <button
              className="link"
              onClick={async () => {
                if (!confirm("删除这张卡片？")) return;
                await libFetch(`/api/library/cards/?id=${card.id}`, { method: "DELETE" }).catch((e) => alert(e.message));
                onChange();
              }}
            >
              删除
            </button>
            <Link
              className="link"
              href={`/feedback/?${new URLSearchParams({
                kind: "suggestion",
                page: card.question ? `/question/${card.question}/` : "/library/",
                target: `我的卡片：《${card.title}》第 ${card.page} 页`,
                body: `建议补充（摘自我的资料《${card.title}》第 ${card.page} 页）：\n${card.quote.slice(0, 800)}${card.note ? `\n\n我的批注：${card.note.slice(0, 600)}` : ""}`,
              })}`}
              title="把这张卡片的内容作为建议发给开发者；不会自动进入公共知识库"
            >
              推荐给开发者
            </Link>
          </div>
        </>
      )}
    </li>
  );
}

export default function LibraryReader({ questions }: { questions: QuestionRef[] }) {
  return (
    <Suspense fallback={<p className="text-ink-3">加载中…</p>}>
      <Inner questions={questions} />
    </Suspense>
  );
}
