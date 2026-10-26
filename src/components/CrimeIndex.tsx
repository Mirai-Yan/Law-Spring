"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type CrimeRow = { id: string; name: string; chapter: string; section?: string; article?: string; pages?: string; done: boolean };

/** 罪名索引：按分则章、节分组，可按罪名或条文号筛选 */
export default function CrimeIndex({ rows }: { rows: CrimeRow[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().replace(/^第|条$/g, "");
    if (!s) return rows;
    return rows.filter((r) => r.name.includes(s) || r.article?.includes(s));
  }, [q, rows]);

  const groups = useMemo(() => {
    const m = new Map<string, Map<string, CrimeRow[]>>();
    for (const r of filtered) {
      const ch = m.get(r.chapter) ?? new Map<string, CrimeRow[]>();
      const sec = r.section ?? "";
      ch.set(sec, [...(ch.get(sec) ?? []), r]);
      m.set(r.chapter, ch);
    }
    return m;
  }, [filtered]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索罪名或条文号，如：诈骗、264"
          aria-label="搜索罪名"
          className="w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2"
        />
        <span className="text-sm text-ink-3">
          {filtered.length} / {rows.length} 个罪名
        </span>
      </div>
      <div className="space-y-10">
        {[...groups].map(([chapter, secs]) => (
          <section key={chapter}>
            <h2 className="section-title mb-3">{chapter}</h2>
            <div className="space-y-4">
              {[...secs].map(([sec, list]) => (
                <div key={sec}>
                  {sec && <h3 className="mb-1.5 text-sm font-semibold text-ink-2">{sec}</h3>}
                  <ul className="flex flex-wrap gap-1.5">
                    {list.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/crime/${r.id}/`}
                          className="chip hover:bg-surface-2"
                          title={`${r.article ? `刑法${r.article} · ` : ""}《刑法学》第 ${r.pages} 页${r.done ? "" : " · 要点待整理"}`}
                        >
                          {!r.done && <span aria-hidden className="text-ink-3">·</span>}
                          {r.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
