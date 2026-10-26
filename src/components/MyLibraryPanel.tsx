"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/account";
import { Highlight, libFetch, readerHref, type Card, type Passage } from "@/lib/library-client";

/** 问题页上的「我的资料」：关联到这个问题的卡片 + 资料中的相关段落；只对登录用户显示 */
export default function MyLibraryPanel({ questionId, query }: { questionId: string; query: string }) {
  const { user } = useUser();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);

  useEffect(() => {
    if (!user) return;
    libFetch<{ cards: Card[] }>(`/api/library/cards/?question=${encodeURIComponent(questionId)}`).then((d) => setCards(d.cards), () => setCards([]));
    libFetch<{ results: Passage[] }>(`/api/library/search/?q=${encodeURIComponent(query)}`).then((d) => setPassages(d.results.slice(0, 5)), () => {});
  }, [user, questionId, query]);

  if (!user || cards === null || (cards.length === 0 && passages.length === 0)) return null;
  return (
    <section id="library" className="card mb-10 space-y-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title !text-base">我的资料</h2>
        <Link href="/library/" className="link text-xs">
          打开资料库 →
        </Link>
      </div>
      {cards.length > 0 && (
        <ul className="space-y-2 text-sm">
          {cards.map((c) => (
            <li key={c.id}>
              <blockquote className="border-l-2 border-[var(--accent)] pl-3 font-serif text-ink-2">{c.quote}</blockquote>
              {c.note && <p className="mt-1 pl-3">{c.note}</p>}
              <Link href={readerHref(c.docId, c.page)} className="link ml-3 text-xs">
                《{c.title}》第 {c.page} 页
              </Link>
            </li>
          ))}
        </ul>
      )}
      {passages.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-ink-3">资料中可能相关的段落（关键词检索）：</p>
          <ul className="space-y-1.5 text-sm">
            {passages.map((p, i) => (
              <li key={i} className="rounded-lg border border-border px-3 py-2">
                <Link href={readerHref(p.docId, p.page)} className="link text-xs">
                  《{p.title}》第 {p.page} 页
                </Link>
                <p className="mt-0.5 text-ink-2">
                  <Highlight text={p.snippet} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
