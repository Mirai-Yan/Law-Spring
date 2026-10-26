"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Bundle } from "@/lib/bundle";
import { applyTheory, compatibility, type Index } from "@/lib/graph";
import { divergence, type GuideData } from "@/lib/guide";
import { allQuizItems, filterQuiz, pickQuiz, type QuizItem } from "@/lib/quiz";
import { askTutor } from "@/lib/tutor-client";
import { useBundleIndex } from "./QuestionWorkbench";
import { InlineRich, termScope } from "./RichText";
import Term from "./Term";
import { IconCheck, IconChevron, IconSparkle, IconStar, IconX } from "./icons";

type StepId = "terms" | "dispute" | "ladder" | "derive" | "compare";
const TITLE: Record<StepId, string> = {
  terms: "先弄懂几个词",
  dispute: "这个问题在争什么",
  ladder: "要先回答哪些问题",
  derive: "推到本题",
  compare: "对照教科书与各说，再做题检验",
};

type Saved = {
  step: number;
  done: StepId[];
  intuition?: string;
  selection: Record<string, string>;
  skipped: string[];
  theory?: string;
  finished?: boolean;
};
const EMPTY: Saved = { step: 0, done: [], selection: {}, skipped: [] };
const LETTER = "ABCDEFGH";

/**
 * 问题页的学习导引：先懂词，再看争点，然后沿先决问题一级级表态，推到本题，最后对照教科书与各说。
 * 全部内容取自知识库；进度按题记在本机。
 */
export default function LearningGuide({ bundle, data }: { bundle: Bundle; data: GuideData }) {
  const ix = useBundleIndex(bundle);
  const key = `fm-guide:${data.qid}`;
  const [s, setS] = useState<Saved>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const steps = useMemo(
    () => (["terms", "dispute", "ladder", "derive", "compare"] as StepId[]).filter((x) => (x === "terms" ? data.terms.length > 0 : x === "ladder" ? data.rungs.length > 0 : true)),
    [data],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setS({ ...EMPTY, ...(JSON.parse(raw) as Saved) });
    } catch {
      /* 读不到就从头开始 */
    }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch {
      /* 存不下只影响下次打开 */
    }
  }, [key, s, loaded]);

  const patch = (p: Partial<Saved>) => setS((x) => ({ ...x, ...p }));
  const next = (id: StepId) => {
    const i = steps.indexOf(id);
    const last = i === steps.length - 1;
    setS((x) => ({ ...x, done: x.done.includes(id) ? x.done : [...x.done, id], step: last ? -1 : i + 1, finished: last || x.finished }));
    window.setTimeout(() => document.getElementById(`guide-step-${Math.min(i + 1, steps.length - 1)}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  };

  const summary: Record<StepId, string> = {
    terms: `${data.terms.length} 个词：${data.terms.map((t) => t.term).join("、")}`,
    dispute: s.intuition ? `你的直觉：${data.answers.find((a) => a.id === s.intuition)?.label ?? ""}` : `${data.answers.length} 种回答`,
    ladder: `已表态 ${data.rungs.filter((r) => s.selection[r.qid]).length} / ${data.rungs.length} 级`,
    derive: s.theory ? `沿「${data.theories.find((t) => t.id === s.theory)?.name ?? ""}」推到本题` : "看结论如何沿推演链得出",
    compare: data.book ? `教科书作者的结论：${data.book.answerLabel}` : "对照各说的结论",
  };

  return (
    <section id="guide" className="mb-12">
      <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="eyebrow mb-1">学习导引</div>
          <h2 className="section-title">按论证的顺序，一步步走到结论</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-3">
          <span className="tabular-nums">
            {s.step >= 0 ? `第 ${s.step + 1} / ${steps.length} 步` : s.finished ? "已走完一遍" : "已收起"}
          </span>
          {(s.done.length > 0 || s.intuition) && (
            <button className="hover:text-ink hover:underline" onClick={() => setS(EMPTY)}>
              重新开始
            </button>
          )}
        </div>
      </div>
      <div className="mb-5 flex gap-1" aria-hidden>
        {steps.map((id, i) => (
          <span key={id} className="guide-seg" data-state={s.done.includes(id) ? "done" : i === s.step ? "current" : "todo"} />
        ))}
      </div>

      <ol className="guide-steps">
        {steps.map((id, i) => {
          const open = i === s.step;
          const done = s.done.includes(id);
          return (
            <li key={id} id={`guide-step-${i}`} className="guide-step" data-state={open ? "current" : done ? "done" : "todo"}>
              <span className="guide-dot" aria-hidden>
                {done && !open ? <IconCheck size={14} /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <button className="guide-head min-w-0 flex-1 text-left" aria-expanded={open} onClick={() => patch({ step: open ? -1 : i })}>
                    <span className="font-serif text-[17px] font-semibold">{TITLE[id]}</span>
                    {!open && <span className="mt-0.5 block truncate text-sm text-ink-3">{summary[id]}</span>}
                  </button>
                  {open && (
                    <button
                      className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs text-ink-3 hover:text-accent-ink"
                      onClick={() => askTutor({ text: `关于「${data.text}」学习导引的「${TITLE[id]}」这一步，我没看懂的是：` })}
                    >
                      <IconSparkle size={13} />
                      这一步没看懂？问 AI
                    </button>
                  )}
                  {!open && <IconChevron size={16} className="mt-1 shrink-0 text-ink-3" />}
                </div>
                {open && (
                  <div className="guide-body">
                    {id === "terms" && <StepTerms data={data} onNext={() => next(id)} />}
                    {id === "dispute" && <StepDispute ix={ix} data={data} s={s} patch={patch} onNext={() => next(id)} />}
                    {id === "ladder" && <StepLadder ix={ix} data={data} s={s} patch={patch} onNext={() => next(id)} />}
                    {id === "derive" && <StepDerive ix={ix} data={data} s={s} patch={patch} onNext={() => next(id)} />}
                    {id === "compare" && <StepCompare ix={ix} data={data} onNext={() => next(id)} />}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {s.finished && s.step === -1 && (
        <p className="mt-4 text-sm text-ink-2">
          已经按论证的顺序走完一遍。下面是这道题的完整资料；也可以去
          <Link href="/practice/" className="link mx-1">
            练习
          </Link>
          里多做几道题。
        </p>
      )}
    </section>
  );
}

function Next({ children = "下一步", onClick, disabled }: { children?: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="mt-5 flex justify-end">
      <button className="btn btn-primary" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    </div>
  );
}

/* ---------------- 第 1 步：先弄懂几个词 ---------------- */

function StepTerms({ data, onNext }: { data: GuideData; onNext: () => void }) {
  return (
    <>
      <p className="text-sm text-ink-2">下面这些词会在这道题里反复出现。点开每个词看释义；还不懂的，可以在释义里直接问 AI。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.terms.map((t) => (
          <span key={t.id} className="guide-term">
            <Term t={t} />
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">释义是编者的概括；正文里出现的这些词也都加了虚下划线，随时可以点开。</p>
      <Next onClick={onNext}>都懂了，下一步</Next>
    </>
  );
}

/* ---------------- 第 2 步：这个问题在争什么 ---------------- */

type StepProps = { ix: Index; data: GuideData; s: Saved; patch: (p: Partial<Saved>) => void; onNext: () => void };

function StepDispute({ ix, data, s, patch, onNext }: StepProps) {
  const scope = termScope();
  return (
    <>
      {data.summary && (
        <p className="prose-cn text-[15px] text-ink-2">
          <InlineRich text={data.summary} ix={ix} terms={scope} />
        </p>
      )}
      <p className="mt-2 text-sm text-ink-2">这个问题有 {data.answers.length} 种回答。先凭直觉选一个——不用担心选错，第 {data.rungs.length ? 4 : 3} 步会回头对照。</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="你的直觉">
        {data.answers.map((a, i) => (
          <button key={a.id} className="guide-option" aria-pressed={s.intuition === a.id} onClick={() => patch({ intuition: s.intuition === a.id ? undefined : a.id })}>
            <span className="text-xs text-ink-3">立场 {LETTER[i]}</span>
            <span className="mt-0.5 block font-serif font-semibold">{a.label}</span>
            {a.summary && (
              <span className="mt-1 block text-sm text-ink-2">
                <InlineRich text={a.summary} ix={ix} terms={scope} />
              </span>
            )}
          </button>
        ))}
      </div>
      <Next onClick={onNext}>{s.intuition ? "下一步" : "先不选，下一步"}</Next>
    </>
  );
}

/* ---------------- 第 3 步：论证台阶 ---------------- */

function StepLadder({ ix, data, s, patch, onNext }: StepProps) {
  const scope = termScope();
  // 前面每一级表了态（或跳过）才露出下一级：论证是一级级走下来的
  let visible = 1;
  while (visible < data.rungs.length && (s.selection[data.rungs[visible - 1].qid] || s.skipped.includes(data.rungs[visible - 1].qid))) visible++;
  const choose = (qid: string, a: string) => {
    const sel = { ...s.selection };
    if (sel[qid] === a) delete sel[qid];
    else sel[qid] = a;
    patch({ selection: sel, theory: undefined });
  };

  return (
    <>
      <p className="text-sm text-ink-2">回答本题之前，得先在下面这些问题上表态。顺序从最根本的问题开始；每表一次态，就能看到它把论证引向哪里。</p>
      <ol className="ladder mt-4">
        {data.rungs.slice(0, visible).map((r, i) => {
          const chosen = s.selection[r.qid];
          const branch = chosen ? r.edge.branches.find((b) => b.answer === chosen) : undefined;
          const ans = r.answers.find((a) => a.id === chosen);
          return (
            <li key={r.qid} className="rung" data-state={chosen ? "done" : "current"}>
              <span className="rung-n" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  {r.foundation ? (
                    <span className="inline-flex items-center gap-1 text-accent-ink">
                      <IconStar size={12} filled />
                      根据论
                    </span>
                  ) : (
                    <span>先决问题</span>
                  )}
                  <span>· 为什么要先问它</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-2">
                  <InlineRich text={r.edge.why} ix={ix} terms={scope} />
                </p>
                <Link href={`/question/${r.qid}/`} className="mt-2 block font-serif font-semibold hover:underline">
                  {r.text}
                </Link>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${r.text} 的答案`}>
                  {r.answers.map((a) => (
                    <button key={a.id} className="btn !px-2.5 !py-0.5 !text-[13px]" aria-pressed={chosen === a.id} title={a.summary} onClick={() => choose(r.qid, a.id)}>
                      {a.label}
                    </button>
                  ))}
                  {!chosen && !s.skipped.includes(r.qid) && i === visible - 1 && i < data.rungs.length - 1 && (
                    <button className="px-2 text-xs text-ink-3 hover:text-ink hover:underline" onClick={() => patch({ skipped: [...s.skipped, r.qid] })}>
                      拿不准，先跳过
                    </button>
                  )}
                </div>
                {chosen && (
                  <div className="rung-lead">
                    <span className="text-accent-ink">你选了「{ans?.label}」，所以 → </span>
                    {branch ? <InlineRich text={branch.leadsTo} ix={ix} /> : <span className="text-ink-2">{ans?.summary ?? "这个答案对下一步的影响，知识库还没有写明。"}</span>}
                    <span className="mt-1 block text-xs text-ink-3">通向：{r.towardText}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {visible < data.rungs.length && <p className="mt-2 pl-9 text-xs text-ink-3">表态之后，下一级才会出现（还有 {data.rungs.length - visible} 级）。</p>}
      {data.more > 0 && (
        <p className="mt-3 text-xs text-ink-3">
          还有 {data.more} 个更远的先决问题没有列在这里，见下方
          <a href="#prereq" className="link mx-1">
            先决问题
          </a>
          的完整根系图。
        </p>
      )}
      <Next onClick={onNext}>下一步：推到本题</Next>
    </>
  );
}

/* ---------------- 第 4 步：推到本题 ---------------- */

function StepDerive({ ix, data, s, patch, onNext }: StepProps) {
  const scope = termScope();
  const rungIds = data.rungs.map((r) => r.qid);
  const picked = Object.fromEntries(Object.entries(s.selection).filter(([q]) => rungIds.includes(q)));
  const withAnswer = data.theories.filter((t) => t.answer);
  const comp = compatibility(ix, picked);
  const score = (tid: string) => comp.find((c) => c.theory.id === tid);
  const best = withAnswer
    .map((t) => ({ t, c: score(t.id) }))
    .filter((x) => x.c)
    .sort((a, b) => a.c!.conflicts.length - b.c!.conflicts.length || b.c!.matched.length - a.c!.matched.length)[0]?.t;
  const theory = withAnswer.find((t) => t.id === s.theory) ?? best;
  const [shown, setShown] = useState(1);
  useEffect(() => {
    setShown(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 99 : 1);
  }, [theory?.id]);

  if (withAnswer.length === 0)
    return (
      <>
        <p className="text-sm text-ink-2">知识库还没有收录各学说在本题上的推演链。可以看下一步的教科书论述，或者在下方「先决问题」里用分岔推演自己走一遍。</p>
        <Next onClick={onNext} />
      </>
    );

  const intuition = data.answers.find((a) => a.id === s.intuition);
  const div = theory && s.intuition && s.intuition !== theory.answer ? divergence(ix, data, s.intuition, picked) : null;

  return (
    <>
      <p className="text-sm text-ink-2">
        {Object.keys(picked).length === 0
          ? "你还没有在台阶上表态。可以直接选一种学说，看它怎么一环一环推到本题："
          : best && theory?.id === best.id
            ? "和你在台阶上的选择最一致的学说已经选好了；也可以换一种学说比较："
            : "选一种学说，看它怎么一环一环推到本题："}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="选择学说">
        {withAnswer.map((t) => {
          const c = score(t.id);
          return (
            <button key={t.id} className="btn !py-1 !text-[13px]" aria-pressed={theory?.id === t.id} onClick={() => patch({ theory: t.id })}>
              {t.name}
              {c && Object.keys(picked).length > 0 && (
                <span className="text-[11px] text-ink-3">
                  一致 {c.matched.length}
                  {c.conflicts.length > 0 && ` · 冲突 ${c.conflicts.length}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {theory && (
        <div className="mt-4">
          <ol className="chain">
            {theory.steps.slice(0, shown).map((st, i) => (
              <li key={i} className="chain-link">
                <InlineRich text={st} ix={ix} terms={scope} />
              </li>
            ))}
            {shown < theory.steps.length ? (
              <li className="chain-more">
                <button className="btn !py-1 !text-[13px]" onClick={() => setShown((n) => n + 1)}>
                  下一环 →
                </button>
                <button className="ml-2 text-xs text-ink-3 hover:text-ink hover:underline" onClick={() => setShown(99)}>
                  全部展开
                </button>
              </li>
            ) : (
              <li className="chain-end">
                <span className="text-xs text-ink-3">结论</span>
                <span className="ml-2 font-serif text-lg font-semibold text-accent-ink">{theory.answerLabel}</span>
              </li>
            )}
          </ol>
          {theory.note && shown >= theory.steps.length && (
            <p className="mt-2 text-sm text-ink-3">
              <InlineRich text={theory.note} ix={ix} />
            </p>
          )}
          {shown >= theory.steps.length && (
            <div className="mt-3 space-y-2 text-sm">
              {intuition && (
                <p className={s.intuition === theory.answer ? "text-ink-2" : "text-ink"}>
                  {s.intuition === theory.answer ? (
                    <>与你一开始的直觉「{intuition.label}」一致。</>
                  ) : (
                    <>
                      和你一开始的直觉「{intuition.label}」不同。
                      {div && (
                        <>
                          主张「{intuition.label}」的{div.theory}，在第 {div.rung} 级台阶上选的是「{div.theirs}」，而你选了「{div.yours}」——分歧从这里开始。
                        </>
                      )}
                    </>
                  )}
                </p>
              )}
              <button className="link text-xs" onClick={() => patch({ selection: { ...s.selection, ...applyTheory(ix, theory.id, rungIds) }, theory: theory.id })}>
                把{theory.name}在各级台阶上的答案填回第 3 步，对照一下
              </button>
            </div>
          )}
        </div>
      )}
      <Next onClick={onNext} />
    </>
  );
}

/* ---------------- 第 5 步：对照与检验 ---------------- */

function StepCompare({ ix, data, onNext }: { ix: Index; data: GuideData; onNext: () => void }) {
  const scope = termScope();
  const quiz = useMemo(() => pickQuiz(filterQuiz(allQuizItems(ix), { question: data.qid }), 3, data.qid.length * 7919), [ix, data.qid]);
  return (
    <>
      {data.book && (
        <div className="rounded-lg bg-surface-2 p-4">
          <div className="text-xs text-ink-3">教科书作者的结论</div>
          <div className="mt-0.5 font-serif text-lg font-semibold text-accent-ink">{data.book.answerLabel}</div>
          <p className="prose-cn mt-1 text-[15px] text-ink-2">
            <InlineRich text={data.book.summary} ix={ix} terms={scope} />
          </p>
          {data.book.reasons.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-2">
              {data.book.reasons.map((r, i) => (
                <li key={i}>
                  <InlineRich text={r} ix={ix} terms={scope} />
                </li>
              ))}
            </ol>
          )}
          <a href="#book" className="link mt-2 inline-block text-sm">
            跳到完整论述与页码 →
          </a>
        </div>
      )}
      {data.theories.some((t) => t.answer) && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs text-ink-3">各学说在本题上的结论</div>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {data.theories
              .filter((t) => t.answer)
              .map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-accent-ink">→ {t.answerLabel}</span>
                </li>
              ))}
          </ul>
          <a href="#stances" className="link mt-2 inline-block text-sm">
            各学说的完整立场 →
          </a>
        </div>
      )}
      <div className="mt-5">
        <div className="mb-2 text-sm font-medium">用 {quiz.length || "几"} 道题检验一下</div>
        {quiz.length === 0 ? (
          <p className="text-sm text-ink-3">
            知识库里暂时没有直接针对这道题的练习。可以到
            <Link href="/practice/" className="link mx-1">
              练习
            </Link>
            按体系位置出题。
          </p>
        ) : (
          <div className="space-y-4">
            {quiz.map((it, i) => (
              <MiniQuiz key={it.id} n={i + 1} it={it} ix={ix} />
            ))}
          </div>
        )}
      </div>
      <Next onClick={onNext}>完成本题的导引</Next>
    </>
  );
}

function MiniQuiz({ n, it, ix }: { n: number; it: QuizItem; ix: Index }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const done = chosen !== null;
  return (
    <div className="rounded-lg border border-border p-3">
      {it.context && <p className="text-xs text-ink-3">{it.context}</p>}
      <p className="text-sm font-medium">
        <span className="mr-1 tabular-nums text-ink-3">{n}.</span>
        {it.prompt}
      </p>
      <div className="mt-2 grid gap-1.5">
        {it.options.map((o) => {
          const right = o.id === it.correct;
          const mine = o.id === chosen;
          return (
            <button
              key={o.id}
              disabled={done}
              onClick={() => setChosen(o.id)}
              className="quiz-opt"
              data-state={done ? (right ? "right" : mine ? "wrong" : "idle") : "idle"}
            >
              {done && right && <IconCheck size={14} />}
              {done && mine && !right && <IconX size={14} />}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
      {done && (
        <div className="mt-2 text-sm text-ink-2">
          <span className="font-medium" style={{ color: chosen === it.correct ? "var(--status-good)" : "var(--status-serious)" }}>
            {chosen === it.correct ? "答对了。" : "答错了。"}
          </span>
          {it.explain.length > 0 && (
            <span>
              {" "}
              <InlineRich text={it.explain.join(" → ")} ix={ix} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
