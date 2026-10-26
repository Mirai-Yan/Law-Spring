"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Bundle } from "@/lib/bundle";
import { aiPost } from "@/lib/ai/client";
import type { AskResult } from "@/lib/ai/schemas";
import { EXAMPLES } from "@/lib/examples";
import { MATCH_THRESHOLD, makeSearcher } from "@/lib/search";
import { LibraryAskSlot } from "./LibraryAsk";
import QuestionWorkbench from "./QuestionWorkbench";
import { LevelBadge, StatusBadge } from "./ui";
import { IconAlert, IconSparkle } from "./icons";


export default function AskClient({ bundle }: { bundle: Bundle }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = params.get("q") ?? "";
  const picked = params.get("id");
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const search = useMemo(() => makeSearcher(bundle.questions, bundle.concepts), [bundle]);
  const hits = useMemo(() => (q ? search(q) : []), [q, search]);
  const matched = hits.length > 0 && hits[0].score <= MATCH_THRESHOLD;
  const selected = picked ?? (matched ? hits[0].question.id : null);

  const go = (query: string, id?: string) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (id) sp.set("id", id);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(draft.trim());
        }}
        className="flex gap-2"
      >
        <label htmlFor="ask-input" className="sr-only">
          输入一个刑法问题
        </label>
        <input
          id="ask-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="输入一个刑法问题，例如：偶然防卫怎么处理"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 font-serif text-base outline-none focus:border-ink-3"
          autoFocus
        />
        <button type="submit" className="btn btn-primary !px-5">
          提问
        </button>
      </form>

      {!q && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} className="chip hover:bg-surface-2" onClick={() => go(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {q && !matched && (
        <div className="card p-4">
          <p className="font-medium">这个问题还没有收录。</p>
          <p className="mt-1 text-sm text-ink-3">
            可以交给 AI：它会先在库中寻找相关的问题，再为这个问题起草一棵标着「AI 推测」的先决问题树，审核后可以存入库中。
          </p>
          <AiAsk key={q} q={q} bundle={bundle} onPick={(id) => go(q, id)} />
          {hits.length > 0 && <p className="mt-4 text-sm text-ink-2">检索到的最接近的问题：</p>}
        </div>
      )}

      {hits.length > 0 && (
        <div>
          {matched && <div className="eyebrow mb-2">匹配到的问题</div>}
          <ul className="flex flex-col gap-1.5">
            {hits.slice(0, matched ? 5 : 6).map((h) => (
              <li key={h.question.id}>
                <button
                  onClick={() => go(q, h.question.id)}
                  className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left ${
                    selected === h.question.id ? "border-ink bg-surface" : "border-border bg-surface hover:bg-surface-2"
                  }`}
                >
                  <LevelBadge level={h.question.level} />
                  <span className="font-serif">{h.question.text}</span>
                  <span className="ml-auto text-xs text-ink-3">
                    {bundle.concepts.find((c) => c.id === h.question.concept)?.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {q && <LibraryAskSlot key={q} q={q} />}

      {selected && (
        <div className="border-t border-border pt-8">
          <QuestionWorkbench key={selected} bundle={bundle} questionId={selected} showHeader />
          <p className="mt-6 text-sm">
            <Link href={`/question/${selected}/`} className="link">
              打开这个问题的完整页面（含各学说立场）→
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

type AskOut = { source: "ai" | "cache" | "demo"; model?: string; result: AskResult };

/** 库外问题交给 AI：找相关问题 + 起草先决树（草稿临时并入知识库渲染，不写入正式内容） */
function AiAsk({ q, bundle, onPick }: { q: string; bundle: Bundle; onPick: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<AskOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const r = await aiPost<AskOut>("/api/ask/", { q });
    setBusy(false);
    if (r.ok) setOut(r.data);
    else setError(r.configured === false ? "服务器还没有配置大模型（DEEPSEEK_API_KEY），暂时只能使用检索。" : r.error);
  };

  const draft = out?.result.draft ?? null;
  const merged = useMemo(
    () =>
      draft
        ? { ...bundle, questions: [...bundle.questions, draft.question], prerequisites: [...bundle.prerequisites, ...draft.prerequisites] }
        : null,
    [bundle, draft],
  );

  if (!out)
    return (
      <div className="mt-3">
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? "AI 分析中…" : <><IconSparkle size={14} />交给 AI 分析</>}
        </button>
        {error && <p className="mt-2 text-sm text-ink-3">{error}</p>}
      </div>
    );

  const { result } = out;
  const byId = new Map(bundle.questions.map((x) => [x.id, x]));
  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="chip">{out.source === "cache" ? "AI 分析（读取自本地缓存）" : "实时 AI 分析"}{out.model ? ` · ${out.model}` : ""}</span>
        {result.warnings.map((w, i) => (
          <span key={i} className="text-ink-3"><IconAlert size={13} className="mr-1 inline-block shrink-0 align-[-0.15em]" />{w}</span>
        ))}
      </div>

      {result.matches.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm text-ink-2">AI 认为库中这些问题与你的问题相关：</p>
          <ul className="flex flex-col gap-1.5">
            {result.matches.map((id) => (
              <li key={id}>
                <button onClick={() => onPick(id)} className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-2">
                  <LevelBadge level={byId.get(id)!.level} />
                  <span className="font-serif">{byId.get(id)!.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft && merged ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge item={draft.question} />
            <span className="text-sm text-ink-3">以下先决树由 AI 起草，只临时显示，没有写入知识库；先决问题都指向库中已有的问题。</span>
          </div>
          {draft.findings.filter((f) => f.level === "error").length > 0 && (
            <ul className="text-sm text-ink-3">
              {draft.findings.map((f, i) => (
                <li key={i}><IconAlert size={13} className="mr-1 inline-block shrink-0 align-[-0.15em]" />{f.message}</li>
              ))}
            </ul>
          )}
          <QuestionWorkbench bundle={merged} questionId={draft.question.id} showHeader />
          <details>
            <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">查看草稿的 YAML（审核后可存入内容库）</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed">{draft.yaml}</pre>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="btn" onClick={() => navigator.clipboard?.writeText(draft.yaml)}>
                复制 YAML
              </button>
              {process.env.NODE_ENV === "development" && (
                <button
                  className="btn"
                  onClick={async () => {
                    const r = await aiPost<{ saved: string }>("/api/inbox/", { yaml: draft.yaml });
                    setSaved(r.ok ? `已存入 ${r.data.saved}` : r.error);
                  }}
                >
                  存入草稿箱
                </button>
              )}
              {saved && <span className="text-sm text-ink-3">{saved}</span>}
            </div>
          </details>
        </div>
      ) : (
        result.matches.length === 0 && <p className="text-sm text-ink-3">AI 没能为这个问题起草可用的先决树。</p>
      )}
    </div>
  );
}
