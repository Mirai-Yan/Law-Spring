"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/account";

const KIND: Record<string, string> = { suggestion: "建议", error: "内容纠错", bug: "功能问题" };
const STATUS: [string, string][] = [
  ["new", "新提交"],
  ["accepted", "已采纳"],
  ["fixed", "已修复"],
  ["declined", "不采纳"],
];

type Item = {
  id: number;
  kind: string;
  target: string | null;
  page: string | null;
  body: string;
  contact: string | null;
  status: string;
  reply: string | null;
  createdAt: number;
  username: string | null;
};

export default function AdminFeedback() {
  const { user, ready } = useUser();
  const [filter, setFilter] = useState("new");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/feedback/?status=${filter === "all" ? "" : filter}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setItems(d.items);
      })
      .catch((e) => setError(e.message));
  }, [filter]);
  useEffect(() => {
    if (user?.admin) load();
  }, [user, load]);

  if (!ready) return null;
  if (!user?.admin) return <p className="text-sm text-ink-3">需要以开发者账号登录。</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1" role="group" aria-label="按状态筛选">
        {[...STATUS, ["all", "全部"] as [string, string]].map(([k, l]) => (
          <button key={k} className="btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      {error && <p className="text-sm">{error}</p>}
      {items?.length === 0 && <p className="text-sm text-ink-3">没有这类反馈。</p>}
      <ul className="space-y-3">
        {items?.map((f) => (
          <AdminItem key={f.id} f={f} onSaved={load} />
        ))}
      </ul>
    </div>
  );
}

function AdminItem({ f, onSaved }: { f: Item; onSaved: () => void }) {
  const [status, setStatus] = useState(f.status);
  const [reply, setReply] = useState(f.reply ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <li className="card space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span className="chip">{KIND[f.kind] ?? f.kind}</span>
        <span>{new Date(f.createdAt).toLocaleString("zh-CN")}</span>
        <span>{f.username ?? "未登录用户"}</span>
        {f.contact && <span>联系方式：{f.contact}</span>}
        {f.target && <code>{f.target}</code>}
        {f.page && (
          <Link href={f.page} className="link">
            {f.page}
          </Link>
        )}
      </div>
      <p className="whitespace-pre-wrap">{f.body}</p>
      <div className="flex flex-wrap items-start gap-2">
        <select className="rounded-lg border border-border bg-surface px-3 py-1.5" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="处理状态">
          {STATUS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <textarea
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5"
          rows={2}
          placeholder="回复（用户登录后可见）"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <button
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await fetch("/api/admin/feedback/", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: f.id, status, reply }),
            });
            setSaving(false);
            onSaved();
          }}
        >
          保存
        </button>
      </div>
    </li>
  );
}
