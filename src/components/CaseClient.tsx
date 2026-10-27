"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { aiPost, aiStatus, type AiStatus } from "@/lib/ai/client";
import type { CaseBrief as Brief, CaseResult } from "@/lib/ai/schemas";
import type { Bundle } from "@/lib/bundle";
import { answerLabel, theoryAnswer, type Index } from "@/lib/graph";
import CaseBrief, { type BriefTurn, type EditableFact } from "./CaseBrief";
import PageToc from "./PageToc";
import QuestionWorkbench, { useBundleIndex } from "./QuestionWorkbench";
import { InlineRich } from "./RichText";
import { LevelBadge, StatusBadge } from "./ui";
import { IconAlert, IconCheck, IconChevron, IconSparkle } from "./icons";

type Demo = { id: string; title: string; text: string };
type Out = { source: "ai" | "cache" | "demo"; model?: string; result: CaseResult };
type BriefReply = { source: "ai" | "cache" | "demo"; model?: string; brief: Brief };
type Stage = "input" | "brief" | "result";
type Confirmed = { restated: string; facts: { text: string }[] };

const SOURCE_LABEL: Record<Out["source"], string> = {
  ai: "实时 AI 分析",
  cache: "AI 分析（读取自本地缓存）",
  demo: "预置演示结果（非实时 AI 输出）",
};
const STAGES: { id: Stage; label: string }[] = [
  { id: "input", label: "描述案情" },
  { id: "brief", label: "确认案情" },
  { id: "result", label: "争点分析" },
];
const STORE = "fm-case";

type Saved = { stage: Stage; text: string; turns: BriefTurn[]; brief: Brief | null; briefSource?: string; facts: EditableFact[]; confirmed: Confirmed | null; out: Out | null };

/** 上一轮整理结果写进对话历史时只留模型需要的部分 */
const briefForHistory = (b: Brief) =>
  JSON.stringify({ restated: b.restated, facts: b.facts.map((f) => ({ text: f.text, source: f.source })), questions: b.questions.map((q) => ({ ask: q.ask, options: q.options })), ready: b.ready });

export default function CaseClient({ bundle, demos, sample }: { bundle: Bundle; demos: Demo[]; sample?: Demo }) {
  const ix = useBundleIndex(bundle);
  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [turns, setTurns] = useState<BriefTurn[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefSource, setBriefSource] = useState<string>();
  const [facts, setFacts] = useState<EditableFact[]>([]);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [out, setOut] = useState<Out | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    aiStatus().then(setStatus);
    // ?demo=<示例编号>：直接载入并分析某个示例（便于分享链接、展板二维码与截图）
    const id = new URLSearchParams(window.location.search).get("demo");
    const d = id ? demos.find((x) => x.id === id) : undefined;
    if (d) {
      setText(d.text);
      analyze({ text: d.text });
    } else {
      // 刷新页面时接着上次的进度
      try {
        const s = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Saved | null;
        if (s) {
          setStage(s.stage);
          setText(s.text);
          setTurns(s.turns);
          setBrief(s.brief);
          setBriefSource(s.briefSource);
          setFacts(s.facts);
          setConfirmed(s.confirmed);
          setOut(s.out);
        }
      } catch {
        /* 没有保存的进度 */
      }
    }
    setRestored(true);
    // 只在首次进入页面时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ stage, text, turns, brief, briefSource, facts, confirmed, out } satisfies Saved));
    } catch {
      /* 存不下只影响刷新后的恢复 */
    }
  }, [restored, stage, text, turns, brief, briefSource, facts, confirmed, out]);

  const go = (s: Stage) => {
    setStage(s);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** 整理一轮：第一轮只有原文；之后每轮带上此前的对话 */
  const runBrief = async (nextTurns: BriefTurn[]) => {
    setBusy(true);
    setError(null);
    const r = await aiPost<BriefReply>("/api/case/brief/", { text, turns: nextTurns });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setTurns(nextTurns);
    setBrief(r.data.brief);
    setBriefSource(r.data.source);
    // 用户改过的事实，如果 AI 原样保留了，继续标「你改过」
    setFacts((prev) => {
      const mine = new Map(prev.filter((f) => f.mine).map((f) => [f.text, f.mine]));
      return r.data.brief.facts.map((f) => ({ ...f, mine: mine.get(f.text) }));
    });
    if (stage !== "brief") go("brief");
  };

  const startBrief = () => {
    setConfirmed(null);
    setOut(null);
    setFacts([]);
    runBrief([]);
  };

  const reply = (answers: { ask: string; answer: string }[], note: string) => {
    if (!brief) return;
    const parts: string[] = [];
    if (answers.length) parts.push("【对问题的回答】", ...answers.map((a) => `问：${a.ask}\n答：${a.answer}`));
    const kept = facts.filter((f) => f.text.trim());
    if (kept.some((f) => f.mine) || kept.length !== brief.facts.length)
      parts.push("【我修改后的事实要点，以此为准】", ...kept.map((f, i) => `${i + 1}. ${f.text}`));
    if (note) parts.push("【补充或更正】", note);
    runBrief([...turns, { role: "assistant", content: briefForHistory(brief) }, { role: "user", content: parts.join("\n") }]);
  };

  const analyze = async (body: { text: string } | { confirmed: Confirmed }) => {
    setBusy(true);
    setError(null);
    setOut(null);
    const r = await aiPost<Out>("/api/case/", body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOut(r.data);
    go("result");
  };

  const confirm = (answers: { ask: string; answer: string }[], note: string) => {
    if (!brief) return;
    // 选了但还没提交的回答、写了但没发出的补充，也算用户确认过的事实
    const extra = [...answers.map((a) => `${a.ask.replace(/[？?]$/, "")}：${a.answer}`), ...(note ? [note] : [])];
    const c = { restated: brief.restated, facts: [...facts.filter((f) => f.text.trim()).map((f) => ({ text: f.text })), ...extra.map((text) => ({ text }))] };
    setConfirmed(c);
    analyze({ confirmed: c });
  };

  const reached: Record<Stage, boolean> = { input: true, brief: !!brief, result: !!out };

  return (
    <div className="space-y-8">
      {/* 三个阶段：描述 → 确认 → 分析；去过的阶段可以点回去 */}
      <ol className="case-steps" aria-label="案例分析的步骤">
        {STAGES.map((s, i) => (
          <li key={s.id}>
            <button className="case-step" data-state={stage === s.id ? "current" : reached[s.id] ? "done" : "todo"} disabled={!reached[s.id] || busy} aria-current={stage === s.id ? "step" : undefined} onClick={() => go(s.id)}>
              <span className="case-step-n">{reached[s.id] && stage !== s.id ? <IconCheck size={13} /> : i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      {stage === "input" && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="card p-4">
              <div className="eyebrow mb-1">先确认案情</div>
              <p className="text-sm text-ink-2">
                你可以随口描述。AI 会先把案情<b className="text-ink">整理复述</b>，有说不清的地方会像做选择题一样问你，直到你们理解一致。
              </p>
            </div>
            <div className="card p-4">
              <div className="eyebrow mb-1">大模型做什么</div>
              <p className="text-sm text-ink-2">
                只做两件事：<b className="text-ink">理解案情、定位争点</b>，并把每个争点对应到知识库中已有的问题；库中不存在的编号一律丢弃。
              </p>
            </div>
            <div className="card p-4">
              <div className="eyebrow mb-1">结论从哪里来</div>
              <p className="text-sm text-ink-2">
                各学说的结论、推演链、先决问题，<b className="text-ink">全部来自结构化知识库</b>，不由大模型生成；每一条都标着「已核实」或「待核实」。
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-2">示例案情：</span>
              {sample && (
                <button className="chip hover:bg-surface-2" style={{ borderColor: "var(--accent)", color: "var(--accent-ink)" }} onClick={() => setText(sample.text)} title="填进输入框，再点「下一步：整理案情」">
                  {sample.title}
                </button>
              )}
              {demos.map((d) => (
                <button
                  key={d.id}
                  className="chip hover:bg-surface-2"
                  onClick={() => {
                    setText(d.text);
                    setBrief(null);
                    setTurns([]);
                    analyze({ text: d.text });
                  }}
                >
                  {d.title}
                </button>
              ))}
            </div>
            <label htmlFor="case-text" className="sr-only">
              案情
            </label>
            <textarea
              id="case-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="用自己的话说说发生了什么（2000 字以内），不必通顺，例如：我同学跟我说，他表哥那天喝了酒，跟人在烧烤摊吵起来……"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 font-serif text-base leading-relaxed outline-none focus:border-ink-3"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button className="btn btn-primary !px-5" disabled={busy || text.trim().length < 10} onClick={startBrief}>
                {busy ? "AI 正在整理…" : "下一步：整理案情"}
              </button>
              <button className="btn" disabled={busy || text.trim().length < 10} onClick={() => analyze({ text })}>
                跳过确认，直接分析
              </button>
              <span className="text-xs text-ink-3">{text.length} / 2000</span>
              <span className="ml-auto text-xs text-ink-3">
                {status === null
                  ? ""
                  : !status.configured
                    ? "未配置大模型：只能分析内置示例案情（使用预置演示结果）"
                    : status.accessCodeRequired
                      ? `实时 AI 需要访问口令；示例案情不用口令，直接查看预置结果`
                      : `已连接大模型：${status.model}`}
              </span>
            </div>
          </div>
        </>
      )}

      {stage === "brief" && brief && (
        <CaseBrief
          brief={brief}
          facts={facts}
          setFacts={setFacts}
          turns={turns}
          busy={busy}
          source={briefSource}
          onReply={reply}
          onConfirm={confirm}
          onBack={() => go("input")}
        />
      )}

      {error && (
        <div className="card p-4 text-sm" role="alert">
          <p className="font-medium">没能完成：{error}</p>
          <p className="mt-1 text-ink-3">可以先试试示例案情，或者到「提问」页直接检索相关问题。</p>
        </div>
      )}
      {busy && stage !== "input" && <p className="text-sm text-ink-3">{stage === "brief" ? "正在处理…" : "分析中…"}</p>}

      {stage === "result" && out && <CaseResultView ix={ix} bundle={bundle} out={out} confirmed={confirmed} onBack={brief ? () => go("brief") : undefined} />}
    </div>
  );
}

function CaseResultView({ ix, bundle, out, confirmed, onBack }: { ix: Index; bundle: Bundle; out: Out; confirmed: Confirmed | null; onBack?: () => void }) {
  const { result } = out;
  const [showCase, setShowCase] = useState(false);
  const toc = [
    ...(confirmed ? [{ id: "case-confirmed", label: "已确认的案情" }] : []),
    ...result.issues.map((it, i) => ({ id: `issue-${i + 1}`, label: `争点 ${i + 1} · ${it.title}` })),
  ];
  return (
    <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
      <PageToc items={toc} title="分析结果" />
      <section className="min-w-0 space-y-5" aria-live="polite">
        {confirmed && (
          <div id="case-confirmed" data-toc-target className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className="inline-flex items-center gap-1 text-sm font-medium" aria-expanded={showCase} onClick={() => setShowCase((v) => !v)}>
                <IconChevron size={14} open={showCase} />
                据以分析的案情（已确认 {confirmed.facts.length} 条事实）
              </button>
              {onBack && (
                <button className="link ml-auto text-sm" onClick={onBack}>
                  回到确认
                </button>
              )}
            </div>
            {showCase && (
              <div className="mt-2 text-sm text-ink-2">
                <p className="prose-cn">{confirmed.restated}</p>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5">
                  {confirmed.facts.map((f, i) => (
                    <li key={i}>{f.text}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip" style={out.source === "demo" ? { background: "var(--status-warning-soft)", borderColor: "transparent" } : undefined}>
            {SOURCE_LABEL[out.source]}
            {out.model && out.source !== "demo" ? ` · ${out.model}` : ""}
          </span>
          <span className="text-ink-3">共 {result.issues.length} 个争点</span>
        </div>
        {result.summary && (
          <p className="prose-cn">
            <span className="chip mr-2 align-middle" style={{ borderColor: "var(--accent)", color: "var(--accent-ink)" }}>
              <IconSparkle size={13} />
              AI
            </span>
            {result.summary}
          </p>
        )}
        {result.warnings.length > 0 && (
          <ul className="space-y-1 text-sm text-ink-3">
            {result.warnings.map((w, i) => (
              <li key={i}>
                <IconAlert size={13} className="mr-1 inline-block shrink-0 align-[-0.15em]" />
                {w}
              </li>
            ))}
          </ul>
        )}
        <ol className="space-y-4">
          {result.issues.map((issue, i) => (
            <IssueCard key={i} n={i + 1} ix={ix} bundle={bundle} issue={issue} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function IssueCard({ n, ix, bundle, issue }: { n: number; ix: Index; bundle: Bundle; issue: CaseResult["issues"][number] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <li id={`issue-${n}`} data-toc-target className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="tabular-nums text-ink-3">争点 {n}</span>
        <h3 className="font-serif text-lg font-bold">{issue.title}</h3>
      </div>
      {(issue.facts || issue.note) && (
        <div className="mt-2 space-y-1 rounded-md bg-surface-2 p-3 text-sm">
          {issue.facts && (
            <p>
              <span className="text-ink-3">案情要点（AI）：</span>
              {issue.facts}
            </p>
          )}
          {issue.note && (
            <p>
              <span className="text-ink-3">对应理由（AI）：</span>
              {issue.note}
            </p>
          )}
        </div>
      )}

      {issue.questionIds.length === 0 ? (
        <div className="mt-3 text-sm">
          <span className="chip" style={{ borderColor: "var(--accent)", color: "var(--accent-ink)" }}>
            <IconSparkle size={13} />
            AI 推测·库中暂无对应问题
          </span>
          <Link href={`/ask/?q=${encodeURIComponent(issue.title)}`} className="link ml-2">
            去提问台交给 AI 起草先决问题 →
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {issue.questionIds.map((qid) => {
            const q = ix.question.get(qid)!;
            return (
              <div key={qid} className="border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <LevelBadge level={q.level} />
                  <Link href={`/question/${qid}/`} className="font-serif font-semibold hover:underline">
                    {q.text}
                  </Link>
                </div>
                <TheoryVerdicts ix={ix} qid={qid} />
                <button className="mt-2 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink" aria-expanded={open === qid} onClick={() => setOpen(open === qid ? null : qid)}>
                  <IconChevron size={14} open={open === qid} />
                  {open === qid ? "收起先决树与分岔推演" : "展开先决树与分岔推演"}
                </button>
                {open === qid && (
                  <div className="mt-3">
                    <QuestionWorkbench bundle={bundle} questionId={qid} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}

/** 各学说在某个问题上的结论（全部取自知识库） */
export function TheoryVerdicts({ ix, qid }: { ix: Index; qid: string }) {
  const rows = ix.db.theories.map((t) => ({ t, ta: theoryAnswer(ix, t.id, qid) })).filter((r) => r.ta);
  if (rows.length === 0) return <p className="mt-2 text-sm text-ink-3">知识库尚未收录各学说在这个问题上的立场。</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs text-ink-3">
          <tr>
            <th className="py-1 pr-3 font-normal">学说</th>
            <th className="py-1 pr-3 font-normal">结论（来自知识库）</th>
            <th className="py-1 font-normal">推演</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, ta }) => (
            <tr key={t.id} className="border-t border-border align-top">
              <td className="whitespace-nowrap py-1.5 pr-3">
                <Link href={`/lens/?theory=${t.id}`} className="hover:underline">
                  {t.name}
                </Link>
              </td>
              <td className="min-w-[9rem] py-1.5 pr-3">
                <span className={ta!.answer ? "font-medium text-accent-ink" : "text-ink-3"}>{answerLabel(ix, qid, ta!.answer)}</span> <StatusBadge item={ta!.position ?? t} compact />
              </td>
              <td className="py-1.5 text-ink-2">
                {ta!.position?.derivation.length ? (
                  <InlineRich text={ta!.position.derivation.join(" → ")} ix={ix} />
                ) : ta!.own ? (
                  "这是该学说本身的主张"
                ) : (
                  <span className="text-ink-3">{ta!.position?.note ?? "—"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
