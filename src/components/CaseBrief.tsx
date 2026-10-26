"use client";

import { useState } from "react";
import type { BriefFact, CaseBrief as Brief } from "@/lib/ai/schemas";
import { IconAlert, IconCheck, IconChevron, IconPencil, IconPlus, IconSparkle, IconTrash } from "./icons";

/** 本地可编辑的一条事实：记住它是不是用户改过、加的 */
export type EditableFact = BriefFact & { mine?: "edited" | "added" };
export type Answer = { picked: string[]; other: string };
export type BriefTurn = { role: "user" | "assistant"; content: string };

const SOURCE_LABEL: Record<string, string> = { 原文: "原文", 补充: "据你的回答" };

/**
 * 案情确认：左边是 AI 对案情的理解（可以逐条修改），右边是它想跟你确认的问题（像选择题一样作答），
 * 下面可以随时补充或更正；双方理解一致后再开始分析。
 */
export default function CaseBrief({
  brief,
  facts,
  setFacts,
  turns,
  busy,
  source,
  onReply,
  onConfirm,
  onBack,
}: {
  brief: Brief;
  facts: EditableFact[];
  setFacts: (f: EditableFact[]) => void;
  turns: BriefTurn[];
  busy: boolean;
  source?: string;
  onReply: (answers: { ask: string; answer: string }[], note: string) => void;
  /** 确认时把还没提交的回答与补充一并带上 */
  onConfirm: (answers: { ask: string; answer: string }[], note: string) => void;
  onBack: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showLog, setShowLog] = useState(false);

  const answered = brief.questions
    .map((q) => {
      const a = answers[q.id];
      const parts = [...(a?.picked ?? []), ...(a?.other.trim() ? [a.other.trim()] : [])];
      return parts.length ? { ask: q.ask, answer: parts.join("；") } : null;
    })
    .filter((x) => x !== null);
  const factsChanged = facts.some((f) => f.mine) || facts.length !== brief.facts.length;
  const canReply = !busy && (answered.length > 0 || note.trim().length > 0 || factsChanged);

  const pick = (qid: string, opt: string, multi: boolean) =>
    setAnswers((x) => {
      const cur = x[qid] ?? { picked: [], other: "" };
      const has = cur.picked.includes(opt);
      const picked = multi ? (has ? cur.picked.filter((p) => p !== opt) : [...cur.picked, opt]) : has ? [] : [opt];
      return { ...x, [qid]: { ...cur, picked, other: multi ? cur.other : "" } };
    });

  const saveEdit = (id: string) => {
    const t = draft.trim();
    if (!t) return;
    setFacts(facts.map((f) => (f.id === id ? { ...f, text: t, mine: f.mine === "added" ? "added" : "edited" } : f)));
    setEditing(null);
  };

  // 新补充的一条还没写内容就取消时，直接去掉
  const cancelEdit = () => {
    setFacts(facts.filter((f) => f.id !== editing || f.text.trim()));
    setEditing(null);
  };

  const submit = () => {
    onReply(answered, note.trim());
    setAnswers({});
    setNote("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="chip" style={{ borderColor: "var(--accent)", color: "var(--accent-ink)" }}>
          <IconSparkle size={13} />
          {source === "demo" ? "预置演示（非实时 AI 输出）" : "AI 整理"}
        </span>
        <span className="text-ink-3">AI 只整理你说过的事实，不下法律结论；有说不清的地方会问你。</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* 左：我理解的案情 */}
        <section className="card p-4 sm:p-5" aria-labelledby="brief-facts">
          <h3 id="brief-facts" className="font-serif text-lg font-semibold">
            我理解的案情
          </h3>
          <p className="prose-cn mt-2 text-[15px] text-ink-2">{brief.restated}</p>
          <ol className="mt-4 space-y-2">
            {facts.map((f, i) => (
              <li key={f.id} className="group flex gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
                <span className="mt-0.5 w-5 shrink-0 text-right text-sm tabular-nums text-ink-3">{i + 1}</span>
                {editing === f.id ? (
                  <div className="min-w-0 flex-1">
                    <label className="sr-only" htmlFor={`fact-${f.id}`}>
                      修改第 {i + 1} 条事实
                    </label>
                    <textarea
                      id={`fact-${f.id}`}
                      autoFocus
                      rows={2}
                      value={draft}
                      maxLength={160}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          saveEdit(f.id);
                        }
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none"
                    />
                    <div className="mt-1.5 flex gap-2">
                      <button className="btn !px-2.5 !py-0.5 !text-[13px]" onClick={() => saveEdit(f.id)}>
                        <IconCheck size={14} />
                        保存
                      </button>
                      <button className="text-xs text-ink-3 hover:text-ink" onClick={cancelEdit}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex-1 text-sm leading-relaxed">
                      {f.text}
                      <span className="ml-1.5 whitespace-nowrap text-[11px] text-ink-3">
                        {f.mine === "edited" ? "· 你改过" : f.mine === "added" ? "· 你补充的" : f.source === "补充" ? `· ${SOURCE_LABEL["补充"]}` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-start gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                      <button
                        className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
                        aria-label={`修改第 ${i + 1} 条`}
                        onClick={() => {
                          setEditing(f.id);
                          setDraft(f.text);
                        }}
                      >
                        <IconPencil size={14} />
                      </button>
                      <button className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`删除第 ${i + 1} 条`} onClick={() => setFacts(facts.filter((x) => x.id !== f.id))}>
                        <IconTrash size={14} />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
          <button
            className="mt-2 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-accent-ink"
            onClick={() => {
              const id = `u${Date.now()}`;
              setFacts([...facts, { id, text: "", source: "补充", mine: "added" }]);
              setEditing(id);
              setDraft("");
            }}
          >
            <IconPlus size={14} />
            补充一条事实
          </button>
        </section>

        {/* 右：想跟你确认 */}
        <section className="card p-4 sm:p-5" aria-labelledby="brief-ask">
          <h3 id="brief-ask" className="font-serif text-lg font-semibold">
            {brief.questions.length ? "想跟你确认几件事" : "AI 已没有关键疑问"}
          </h3>
          {brief.questions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">
              {factsChanged ? "你改动了事实要点，可以让 AI 按新的事实再整理一遍；" : ""}如果左边的理解与你一致，就可以开始分析了。还想补充，也可以在下面继续说。
            </p>
          ) : (
            <div className="mt-3 space-y-5">
              {brief.questions.map((q, n) => {
                const a = answers[q.id] ?? { picked: [], other: "" };
                return (
                  <fieldset key={q.id}>
                    <legend className="text-[15px] font-medium leading-snug">
                      <span className="mr-1 tabular-nums text-ink-3">{n + 1}.</span>
                      {q.ask}
                    </legend>
                    {q.why && <p className="mt-0.5 text-xs text-ink-3">为什么问：{q.why}</p>}
                    <div className="mt-2 grid gap-1.5">
                      {q.options.map((o) => {
                        const on = a.picked.includes(o);
                        return (
                          <button key={o} type="button" className="brief-opt" aria-pressed={on} onClick={() => pick(q.id, o, q.multi)}>
                            <span className="brief-mark" data-multi={q.multi || undefined} aria-hidden>
                              {on && <IconCheck size={12} />}
                            </span>
                            {o}
                          </button>
                        );
                      })}
                      <label className="brief-opt" data-other>
                        <span className="brief-mark" aria-hidden />
                        <span className="sr-only">其他回答</span>
                        <input
                          value={a.other}
                          maxLength={120}
                          onChange={(e) => setAnswers((x) => ({ ...x, [q.id]: { picked: q.multi ? a.picked : [], other: e.target.value } }))}
                          placeholder="其他…（自己写）"
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                      </label>
                    </div>
                    {q.multi && <p className="mt-1 text-[11px] text-ink-3">可以多选</p>}
                  </fieldset>
                );
              })}
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <label htmlFor="brief-note" className="text-sm font-medium">
              还有要补充或更正的？
            </label>
            <textarea
              id="brief-note"
              rows={3}
              maxLength={600}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：其实乙是先动手的；甲事后把钱还了一半……"
              className="mt-1.5 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none"
            />
            <button className="btn mt-2 w-full sm:w-auto" disabled={!canReply} onClick={submit}>
              {busy ? "AI 正在更新理解…" : "提交回答，更新理解"}
            </button>
          </div>
        </section>
      </div>

      {brief.warnings.map((w, i) => (
        <p key={i} className="flex items-center gap-1 text-sm text-ink-3">
          <IconAlert size={14} />
          {w}
        </p>
      ))}

      {turns.length > 0 && (
        <div>
          <button className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink" aria-expanded={showLog} onClick={() => setShowLog((v) => !v)}>
            <IconChevron size={14} open={showLog} />
            对话记录（{turns.filter((t) => t.role === "user").length} 轮）
          </button>
          {showLog && (
            <ol className="mt-2 space-y-2 border-l border-border pl-4 text-sm">
              {turns
                .filter((t) => t.role === "user")
                .map((t, i) => (
                  <li key={i} className="whitespace-pre-wrap text-ink-2">
                    <span className="text-xs text-ink-3">第 {i + 1} 轮 · 你：</span>
                    {"\n"}
                    {t.content}
                  </li>
                ))}
            </ol>
          )}
        </div>
      )}

      {/* 底部操作栏：随时可以确认，也可以回去改原文 */}
      <div className="brief-bar">
        <div className="min-w-0 flex-1 basis-full text-sm sm:basis-0">
          {brief.ready && !factsChanged ? (
            <span className="inline-flex items-center gap-1 text-accent-ink">
              <IconCheck size={15} />
              AI 已没有关键疑问
            </span>
          ) : (
            <span className="text-ink-3">理解一致了就可以开始；不必回答完所有问题。</span>
          )}
        </div>
        <button className="btn flex-1 whitespace-nowrap sm:flex-none" onClick={onBack} disabled={busy}>
          <span className="sm:hidden">改原文</span>
          <span className="hidden sm:inline">返回修改原文</span>
        </button>
        <button className="btn btn-primary flex-[2] whitespace-nowrap sm:flex-none" onClick={() => onConfirm(answered, note.trim())} disabled={busy || facts.filter((f) => f.text.trim()).length === 0}>
          <span className="sm:hidden">理解一致，开始分析</span>
          <span className="hidden sm:inline">理解一致，开始分析争点</span>
        </button>
      </div>
    </div>
  );
}
