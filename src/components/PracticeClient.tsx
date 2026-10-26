"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Bundle } from "@/lib/bundle";
import { allQuizItems, filterQuiz, pickQuiz, QUIZ_KIND_LABEL, type QuizItem } from "@/lib/quiz";
import { AREA_LABEL, AREA_ORDER, type Area } from "@/lib/schema";
import { readLocal, setSynced, SYNC_EVENT } from "@/lib/account";
import { ONLINE_DEMO } from "@/lib/deploy";
import { useBundleIndex } from "./QuestionWorkbench";
import { InlineRich } from "./RichText";
import { IconCheck, IconClock, IconX } from "./icons";

/** 旧版本只存在本机的进度，读取一次后并入同步存储 */
const LEGACY_STORE = "crimlaw-practice";

export type PracticeStats = { answered: number; correct: number; byArea: Record<string, { answered: number; correct: number }> };

export function readStats(): PracticeStats {
  const synced = readLocal<PracticeStats>("practice")?.value;
  if (synced && typeof synced.answered === "number") return synced;
  try {
    const s = JSON.parse(localStorage.getItem(LEGACY_STORE) ?? "");
    if (s && typeof s.answered === "number") return s;
  } catch {
    /* 没有记录或无法读取 */
  }
  return { answered: 0, correct: 0, byArea: {} };
}

function record(item: QuizItem, ok: boolean) {
  try {
    const s = readStats();
    s.answered++;
    if (ok) s.correct++;
    const k = item.area ?? "other";
    const a = (s.byArea[k] ??= { answered: 0, correct: 0 });
    a.answered++;
    if (ok) a.correct++;
    setSynced("practice", s);
  } catch {
    /* 无法保存时只是不记录进度 */
  }
}

export default function PracticeClient({ bundle }: { bundle: Bundle }) {
  const ix = useBundleIndex(bundle);
  const all = useMemo(() => allQuizItems(ix), [ix]);
  const [area, setArea] = useState<Area | "all">("all");
  const [foundation, setFoundation] = useState<string>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [round, setRound] = useState<QuizItem[] | null>(null);
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [stats, setStats] = useState<PracticeStats | null>(null);

  useEffect(() => setStats(readStats()), [round, i]);
  // 登录后从服务器拉到了其他设备上的进度
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent).detail?.key === "practice" && setStats(readStats());
    window.addEventListener(SYNC_EVENT, on);
    return () => window.removeEventListener(SYNC_EVENT, on);
  }, []);

  const pool = filterQuiz(all, { area, foundation, verifiedOnly });
  const foundations = [...new Set(ix.db.theories.map((t) => t.question))];
  const sel = "min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm";

  const start = () => {
    setRound(pickQuiz(pool, 10, Date.now() & 0xffffffff));
    setI(0);
    setChosen(null);
    setResults([]);
  };

  if (!round)
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
            <span className="shrink-0 text-ink-2">体系位置</span>
            <select className={sel} value={area} onChange={(e) => setArea(e.target.value as Area | "all")}>
              <option value="all">全部</option>
              {AREA_ORDER.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
            <span className="shrink-0 text-ink-2">根据论</span>
            <select className={sel} value={foundation} onChange={(e) => setFoundation(e.target.value)}>
              <option value="all">不限</option>
              {foundations.map((q) => (
                <option key={q} value={q}>
                  {ix.question.get(q)?.text}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
            只用已核实的内容出题
          </label>
        </div>
        <p className="text-sm text-ink-3">
          当前条件下可出 {pool.length} 道题，每组随机抽 10 道。
          {foundation !== "all" && "（选定根据论时，不出「先决问题」题型。）"}
        </p>
        <button className="btn btn-primary !px-5" disabled={pool.length === 0} onClick={start}>
          开始练习
        </button>
        {pool.length === 0 && verifiedOnly && (
          <p className="text-sm text-ink-3">目前还没有已核实的内容可以出题。核对原文并把条目标为 verified 后，这里就会出现题目。</p>
        )}
        {stats && stats.answered > 0 && (
          <div className="card p-4 text-sm">
            <div className="font-medium">
              累计做题 {stats.answered} 道，答对 {stats.correct} 道（{Math.round((stats.correct / stats.answered) * 100)}%）
            </div>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {AREA_ORDER.filter((a) => stats.byArea[a]).map((a) => (
                <li key={a} className="text-ink-2">
                  {AREA_LABEL[a]}：{stats.byArea[a].correct} / {stats.byArea[a].answered}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">
              进度保存在这台设备上{ONLINE_DEMO ? "。" : <>；<a href="/login/" className="link">登录</a>后会在你的各台设备之间同步。</>}
            </p>
          </div>
        )}
      </div>
    );

  if (i >= round.length) {
    const ok = results.filter(Boolean).length;
    return (
      <div className="space-y-4">
        <h2 className="font-serif text-2xl font-bold">
          本组答对 {ok} / {round.length}
        </h2>
        <ul className="space-y-2 text-sm">
          {round.map((it, k) => (
            <li key={it.id} className="flex gap-2">
              <span className="mt-0.5" style={{ color: results[k] ? "var(--status-good)" : "var(--status-serious)" }}>{results[k] ? <IconCheck size={15} /> : <IconX size={15} />}</span>
              <span className="sr-only">{results[k] ? "答对" : "答错"}</span>
              <Link href={it.links[0].href} className="hover:underline">
                {it.prompt}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={start}>
            再来一组
          </button>
          <button className="btn" onClick={() => setRound(null)}>
            修改出题范围
          </button>
        </div>
      </div>
    );
  }

  const it = round[i];
  const answered = chosen !== null;
  const ok = chosen === it.correct;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <span className="tabular-nums">
          第 {i + 1} / {round.length} 题
        </span>
        <span className="chip">{QUIZ_KIND_LABEL[it.kind]}</span>
        {!it.verified && <span className="chip" style={{ background: "var(--status-warning-soft)", borderColor: "transparent", color: "var(--status-warning)" }}><IconClock size={13} />依据的内容待核实</span>}
      </div>
      {it.context && <p className="text-sm text-ink-3">{it.context}</p>}
      <h2 className="font-serif text-xl font-bold leading-snug">{it.prompt}</h2>
      <ul className="space-y-2" role="list">
        {it.options.map((o) => {
          const isCorrect = o.id === it.correct;
          const isChosen = o.id === chosen;
          const style = answered
            ? isCorrect
              ? { borderColor: "var(--status-good)", background: "var(--status-good-soft)" }
              : isChosen
                ? { borderColor: "var(--status-serious)", background: "var(--status-serious-soft)" }
                : undefined
            : undefined;
          return (
            <li key={o.id}>
              <button
                disabled={answered}
                onClick={() => {
                  setChosen(o.id);
                  const good = o.id === it.correct;
                  setResults((r) => [...r, good]);
                  record(it, good);
                }}
                className="flex w-full items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-left font-serif hover:bg-surface-2 disabled:cursor-default"
                style={style}
              >
                <span aria-hidden className="w-4 shrink-0 text-ink-3">
                  {answered && isCorrect ? <IconCheck size={15} /> : answered && isChosen ? <IconX size={15} /> : null}
                </span>
                {o.label}
              </button>
            </li>
          );
        })}
      </ul>
      {answered && (
        <div className="card space-y-2 p-4 text-sm" aria-live="polite">
          <div className="font-medium">{ok ? "答对了。" : "答错了。"}讲解：</div>
          <ol className="space-y-1 text-ink-2">
            {it.explain.map((e, k) => (
              <li key={k}>
                <InlineRich text={e} ix={ix} />
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3 pt-1">
            {it.links.map((l) => (
              <Link key={l.href} href={l.href} className="link">
                {l.label} →
              </Link>
            ))}
          </div>
          <button
            className="btn btn-primary mt-2"
            onClick={() => {
              setI(i + 1);
              setChosen(null);
            }}
          >
            {i + 1 < round.length ? "下一题" : "查看结果"}
          </button>
        </div>
      )}
    </div>
  );
}
