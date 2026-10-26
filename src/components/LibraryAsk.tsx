"use client";

import Link from "next/link";
import { useState } from "react";
import { useUser } from "@/lib/account";
import { Highlight, libFetch, readerHref, type LibraryAnswer } from "@/lib/library-client";
import { IconAlert } from "./icons";

/** 「只在我的资料里问」：回答只依据检索到的段落，每个 [n] 都能点回原文页 */
export default function LibraryAsk({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<LibraryAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setOut(await libFetch<LibraryAnswer>("/api/library/ask/", { method: "POST", json: { q: q.trim() } }));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {compact ? (
        <button className="btn" onClick={() => run()} disabled={busy}>
          {busy ? "检索中…" : "⌕ 只在我的资料里找"}
        </button>
      ) : (
        <form onSubmit={run} className="flex gap-2">
          <label htmlFor="lib-ask" className="sr-only">
            在我的资料里提问
          </label>
          <input
            id="lib-ask"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="例如：我的资料怎么讨论处分意识？"
            maxLength={200}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-ink-3"
          />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "检索中…" : "提问"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-ink-3"><IconAlert size={13} className="mr-1 inline-block shrink-0 align-[-0.15em]" />{error}</p>}
      {out && <AnswerView out={out} />}
    </div>
  );
}

function AnswerView({ out }: { out: LibraryAnswer }) {
  const used = new Set(out.used);
  return (
    <div className="space-y-3">
      {out.answer && (
        <div className="card p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <span className="chip">只依据你的资料{out.model ? ` · ${out.model}` : ""}</span>
            <span>方括号里的编号对应下方段落，点开可回到原文页核对。</span>
          </div>
          <p className="whitespace-pre-wrap font-serif leading-relaxed">
            {out.answer.split(/(\[\d+\])/).map((s, i) => {
              const m = s.match(/^\[(\d+)\]$/);
              if (!m) return <span key={i}>{s}</span>;
              const p = out.passages[Number(m[1]) - 1];
              return (
                <Link key={i} href={readerHref(p.docId, p.page)} className="link mx-0.5 align-super text-[0.7em]" title={`《${p.title}》第 ${p.page} 页`}>
                  [{m[1]}]
                </Link>
              );
            })}
          </p>
        </div>
      )}
      {out.warnings.map((w, i) => (
        <p key={i} className="text-sm text-ink-3">
          <IconAlert size={13} className="mr-1 inline-block shrink-0 align-[-0.15em]" />{w}
        </p>
      ))}
      {out.passages.length > 0 && (
        <ol className="space-y-1.5 text-sm">
          {out.passages.map((p, i) => (
            <li key={i} className={`rounded-lg border px-3 py-2 ${used.has(i + 1) ? "border-ink-3 bg-surface" : "border-border"}`}>
              <div className="flex flex-wrap items-baseline gap-2 text-xs text-ink-3">
                <span className="font-mono">[{i + 1}]</span>
                <Link href={readerHref(p.docId, p.page)} className="link">
                  《{p.title}》第 {p.page} 页
                </Link>
              </div>
              <p className="mt-0.5 text-ink-2">
                <Highlight text={p.snippet} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 提问台上的入口：登录用户可以把同一个问题拿到自己的资料里找 */
export function LibraryAskSlot({ q }: { q: string }) {
  const { user } = useUser();
  if (!user) return null;
  return (
    <div className="card p-4">
      <p className="mb-2 text-sm text-ink-2">也可以只在你上传的资料里找这个问题：</p>
      <LibraryAsk initial={q} compact />
    </div>
  );
}
