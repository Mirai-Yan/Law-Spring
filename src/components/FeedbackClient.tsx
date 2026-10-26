"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/account";

const KINDS = [
  ["error", "内容纠错"],
  ["suggestion", "建议"],
  ["bug", "功能问题"],
] as const;
const STATUS: Record<string, string> = { new: "新提交", accepted: "已采纳", fixed: "已修复", declined: "不采纳" };

type Item = { id: number; kind: string; target: string | null; page: string | null; body: string; status: string; reply: string | null; createdAt: number };

function Inner() {
  const sp = useSearchParams();
  const { user } = useUser();
  const [kind, setKind] = useState<string>(sp.get("kind") ?? "suggestion");
  const [target] = useState(sp.get("target") ?? "");
  const [page] = useState(sp.get("page") ?? "");
  const [body, setBody] = useState(sp.get("body") ?? "");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Item[] | null>(null);

  const loadMine = useCallback(() => {
    fetch("/api/feedback/", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setMine(d.items));
  }, []);
  useEffect(() => {
    if (user) loadMine();
  }, [user, loadMine]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    setError(null);
    const r = await fetch("/api/feedback/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, target: target || null, page: page || null, body, contact: contact || null }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? "提交失败");
      setState("idle");
      return;
    }
    setState("done");
    setBody("");
    if (user) loadMine();
  };

  const field = "w-full rounded-lg border border-border bg-surface px-3 py-2";
  return (
    <div className="grid gap-8 md:grid-cols-5">
      <form onSubmit={submit} className="card space-y-4 p-5 md:col-span-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="反馈类型">
          {KINDS.map(([k, l]) => (
            <button key={k} type="button" className="btn" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
        {(target || page) && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            {target && <>针对条目：<code>{target}</code> </>}
            {page && (
              <>
                所在页面：
                <Link href={page} className="link">
                  {page}
                </Link>
              </>
            )}
          </p>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">{kind === "error" ? "哪里有误？正确的应该是什么？有原文出处的话请一并写上" : "你的想法"}</span>
          <textarea className={field} rows={6} value={body} onChange={(e) => setBody(e.target.value)} required minLength={5} maxLength={2000} />
          <span className="mt-1 block text-right text-xs text-ink-3">{body.length} / 2000</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">联系方式（选填，方便我们回复你）</span>
          <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={300} />
        </label>
        {error && (
          <p className="text-sm" role="alert" style={{ color: "var(--status-serious)" }}>
            {error}
          </p>
        )}
        {state === "done" && <p className="text-sm text-ink-2">已收到，谢谢！{user ? "处理进度会显示在右侧。" : ""}</p>}
        <button className="btn btn-primary" disabled={state === "busy"}>
          {state === "busy" ? "提交中…" : "提交"}
        </button>
      </form>

      <section className="md:col-span-2">
        <h2 className="section-title mb-3 !text-base">我的反馈</h2>
        {!user ? (
          <p className="text-sm text-ink-3">
            <Link href="/login/?next=/feedback/" className="link">
              登录
            </Link>
            后可以在这里看到你提交过的反馈和开发者的回复。
          </p>
        ) : mine === null ? null : mine.length === 0 ? (
          <p className="text-sm text-ink-3">还没有提交过反馈。</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {mine.map((f) => (
              <li key={f.id} className="card p-3">
                <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
                  <span>{KINDS.find(([k]) => k === f.kind)?.[1]}</span>
                  <span className="chip">{STATUS[f.status] ?? f.status}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{f.body}</p>
                {f.reply && <p className="mt-2 rounded-md bg-surface-2 p-2 text-ink-2">开发者回复：{f.reply}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function FeedbackClient() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
