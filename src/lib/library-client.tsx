"use client";

/** 个人资料库的浏览器端请求；类型与服务器端 src/lib/library.ts 保持一致 */

export type DocMeta = { id: number; title: string; filename: string; kind: string; pages: number; chars: number; createdAt: number };
export type Passage = { docId: number; title: string; page: number; snippet: string };
export type Card = { id: number; docId: number; title: string; page: number; quote: string; note: string | null; question: string | null; createdAt: number };
export type LibraryAnswer = { answer: string; used: number[]; passages: Passage[]; warnings: string[]; model?: string };
export type QuestionRef = { id: string; text: string };

export async function libFetch<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const r = await fetch(url, {
    cache: "no-store",
    ...rest,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json" } } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `请求失败（${r.status}）`);
  return d as T;
}

export const readerHref = (docId: number, page: number) => `/library/read/?doc=${docId}&page=${page}`;

/** 检索结果里用 «» 标出的命中词 */
export function Highlight({ text }: { text: string }) {
  const parts = text.split(/«|»/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-[var(--accent-soft)] px-0.5 text-ink">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
