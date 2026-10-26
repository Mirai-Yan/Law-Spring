"use client";

import { useMemo, useState } from "react";
import { IconAlert, IconCheckCircle, IconClock } from "./icons";

export type ReviewItem = {
  key: string;
  kind: string;
  kindLabel: string;
  label: string;
  file: string;
  jurisdiction?: string;
  status: string;
  needsSource: boolean;
  note?: string;
  href?: string;
  /** 本机私有的原文锚点（只在开发模式下传入） */
  anchors?: { page: number; text: string; of: string }[];
};

export default function ReviewList({
  items: initial,
  jurisdictions,
  editable = false,
}: {
  items: ReviewItem[];
  jurisdictions: { id: string; name: string }[];
  editable?: boolean;
}) {
  // 点了按钮的条目先在本页更新状态；YAML 已写回，刷新页面后与文件一致
  const [changed, setChanged] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const items = useMemo(() => initial.map((i) => (changed[i.key] ? { ...i, status: changed[i.key] } : i)), [initial, changed]);
  const setStatus = async (i: ReviewItem, status: string) => {
    const r = await fetch("/api/review/", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: i.kind, key: i.key, status }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setChanged((c) => ({ ...c, [i.key]: status }));
      setErrors((e) => {
        const next = { ...e };
        delete next[i.key];
        return next;
      });
    } else setErrors((e) => ({ ...e, [i.key]: d.error ?? "写入失败" }));
  };
  const [kind, setKind] = useState("all");
  const [jur, setJur] = useState("all");
  const [flag, setFlag] = useState<"pending" | "needsSource" | "verified" | "all">("pending");

  const kinds = useMemo(() => [...new Map(items.map((i) => [i.kind, i.kindLabel]))], [items]);
  const shown = items.filter(
    (i) =>
      (kind === "all" || i.kind === kind) &&
      (jur === "all" || i.jurisdiction === jur) &&
      (flag === "all" ||
        (flag === "pending" && i.status !== "verified") ||
        (flag === "needsSource" && i.needsSource) ||
        (flag === "verified" && i.status === "verified")),
  );
  const byFile = new Map<string, ReviewItem[]>();
  for (const i of shown) {
    const l = byFile.get(i.file) ?? [];
    l.push(i);
    byFile.set(i.file, l);
  }

  const sel = "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm";
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className={sel} value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)} aria-label="审核状态">
          <option value="pending">待核实</option>
          <option value="needsSource">缺出处</option>
          <option value="verified">已核实</option>
          <option value="all">全部</option>
        </select>
        <select className={sel} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="实体类型">
          <option value="all">全部类型</option>
          {kinds.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select className={sel} value={jur} onChange={(e) => setJur(e.target.value)} aria-label="法域">
          <option value="all">全部法域</option>
          {jurisdictions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-ink-3">{shown.length} 条</span>
      </div>
      <div className="space-y-6">
        {[...byFile].map(([file, list]) => (
          <section key={file}>
            <h3 className="mb-2 font-mono text-sm text-ink-2">{file}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {list.map((i) => (
                <li key={i.key} id={i.kind === "works" ? `work-${i.key.split(":")[1]}` : undefined} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="w-16 shrink-0 text-xs text-ink-3">{i.kindLabel}</span>
                  <span className="min-w-0 flex-1">
                    {i.href ? (
                      <a href={i.href} className="hover:underline">
                        {i.label}
                      </a>
                    ) : (
                      i.label
                    )}
                    {i.note && <span className="block text-xs text-ink-3">编者注：{i.note}</span>}
                    {i.anchors && i.anchors.length > 0 && (
                      <span className="mt-1 block space-y-0.5 text-xs text-ink-3">
                        {i.anchors.map((a, k) => (
                          <span key={k} className="block">
                            <span className="tabular-nums">p.{a.page}</span>　{a.of}：「{a.text}」
                          </span>
                        ))}
                      </span>
                    )}
                    {errors[i.key] && <span className="block text-xs" style={{ color: "var(--status-serious)" }}><IconAlert size={13} className="mr-1 inline-block shrink-0 align-[-0.15em]" />{errors[i.key]}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {i.status === "verified" ? (
                      <span className="chip" style={{ background: "var(--status-good-soft)", borderColor: "transparent", color: "var(--status-good)" }}><IconCheckCircle size={13} />已核实</span>
                    ) : i.status === "disputed" ? (
                      <span className="chip" style={{ background: "var(--status-serious-soft)", borderColor: "transparent", color: "var(--status-serious)" }}><IconAlert size={13} />存疑</span>
                    ) : (
                      <span className="chip" style={{ background: "var(--status-warning-soft)", borderColor: "transparent", color: "var(--status-warning)" }}><IconClock size={13} />待核实</span>
                    )}
                    {i.needsSource && <span className="chip">? 缺出处</span>}
                  </span>
                  {editable && i.kind !== "spectra" && (
                    <span className="flex shrink-0 gap-1">
                      {i.status !== "verified" && (
                        <button className="btn !px-2 !py-0.5 !text-xs" onClick={() => setStatus(i, "verified")}>
                          核对通过
                        </button>
                      )}
                      {i.status !== "disputed" && (
                        <button className="btn !px-2 !py-0.5 !text-xs" onClick={() => setStatus(i, "disputed")}>
                          存疑
                        </button>
                      )}
                      {i.status !== "draft" && (
                        <button className="btn !px-2 !py-0.5 !text-xs" onClick={() => setStatus(i, "draft")}>
                          撤回
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
