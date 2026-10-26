"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/account";
import { Highlight, libFetch, readerHref, type Card, type DocMeta, type Passage, type QuestionRef } from "@/lib/library-client";
import LibraryAsk from "./LibraryAsk";
import { IconAlert, IconCheckCircle } from "./icons";

const KIND_LABEL: Record<string, string> = { pdf: "PDF", docx: "Word", txt: "文本", md: "Markdown" };

export default function LibraryClient({ questions }: { questions: QuestionRef[] }) {
  const { user, ready } = useUser();
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [tab, setTab] = useState<"docs" | "search" | "ask" | "cards">("docs");

  const load = useCallback(() => {
    libFetch<{ docs: DocMeta[] }>("/api/library/").then((d) => setDocs(d.docs), () => setDocs([]));
    libFetch<{ cards: Card[] }>("/api/library/cards/").then((d) => setCards(d.cards), () => {});
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!ready) return null;
  if (!user)
    return (
      <div className="card p-5 text-sm">
        个人资料库需要登录。<Link href="/login/?next=/library/" className="link">登录或注册</Link>
        后，可以上传论文和书籍，在里面检索、提问、摘录卡片；资料只有你自己能看到。
      </div>
    );

  const qText = new Map(questions.map((q) => [q.id, q.text]));
  return (
    <div className="space-y-6">
      <Uploader onDone={load} />
      <div role="group" aria-label="资料库视图" className="flex flex-wrap gap-1">
        {(
          [
            ["docs", `我的资料（${docs?.length ?? 0}）`],
            ["search", "全文检索"],
            ["ask", "只在我的资料里问"],
            ["cards", `我的卡片（${cards.length}）`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className="btn" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "docs" && <DocList docs={docs} onChange={load} />}
      {tab === "search" && <Search />}
      {tab === "ask" && (
        <section className="space-y-2">
          <p className="text-sm text-ink-3">先在你的资料里全文检索，再由大模型只依据检索到的段落作答；回答里的段落编号逐一核对过，资料里没有的内容不会替你补。</p>
          <LibraryAsk />
        </section>
      )}
      {tab === "cards" && (
        <ul className="space-y-2">
          {cards.length === 0 && <li className="text-sm text-ink-3">在阅读页选中一段文字，就可以存成卡片。</li>}
          {cards.map((c) => (
            <li key={c.id} className="card p-3 text-sm">
              <blockquote className="border-l-2 border-border pl-3 font-serif text-ink-2">{c.quote}</blockquote>
              {c.note && <p className="mt-1.5">{c.note}</p>}
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
                <Link href={readerHref(c.docId, c.page)} className="link">
                  《{c.title}》第 {c.page} 页
                </Link>
                {c.question && (
                  <Link href={`/question/${c.question}/`} className="link">
                    → {qText.get(c.question) ?? c.question}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Uploader({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<{ ok: boolean; text: string }[]>([]);

  const upload = async (files: FileList | File[]) => {
    const out: { ok: boolean; text: string }[] = [];
    for (const f of Array.from(files)) {
      setBusy(`正在处理「${f.name}」…`);
      const fd = new FormData();
      fd.append("file", f);
      try {
        const d = await libFetch<{ title: string; pages: number }>("/api/library/upload/", { method: "POST", body: fd });
        out.push({ ok: true, text: `「${d.title}」已加入，共 ${d.pages} 页` });
      } catch (e) {
        out.push({ ok: false, text: `「${f.name}」：${(e as Error).message}` });
      }
    }
    setBusy(null);
    setMsgs(out);
    onDone();
  };

  return (
    <div
      className={`card flex flex-col items-center gap-2 border-dashed p-6 text-center text-sm transition-colors ${over ? "bg-surface-2" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <p className="font-serif text-base">把论文、书籍拖到这里，或</p>
      <button className="btn btn-primary" disabled={!!busy} onClick={() => input.current?.click()}>
        选择文件上传
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-ink-3">支持带文字层的 PDF、Word（.docx）、TXT、Markdown，单个文件不超过 50 MB。扫描版 PDF 需要先做 OCR。资料只有你自己能看到。</p>
      {busy && <p className="text-ink-2">{busy}</p>}
      {msgs.map((m, i) => (
        <p key={i} className="flex items-center gap-1.5" style={{ color: m.ok ? "var(--status-good)" : "var(--status-serious)" }}>
          {m.ok ? <IconCheckCircle size={14} /> : <IconAlert size={14} />}
          {m.text}
        </p>
      ))}
    </div>
  );
}

function DocList({ docs, onChange }: { docs: DocMeta[] | null; onChange: () => void }) {
  if (!docs) return null;
  if (!docs.length) return <p className="text-sm text-ink-3">还没有上传资料。</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {docs.map((d) => (
        <li key={d.id} className="card flex flex-col gap-2 p-4 text-sm">
          <Link href={readerHref(d.id, 1)} className="font-serif text-base font-bold hover:underline">
            {d.title}
          </Link>
          <div className="flex flex-wrap gap-x-3 text-xs text-ink-3">
            <span>{KIND_LABEL[d.kind] ?? d.kind}</span>
            <span>{d.pages} 页</span>
            <span>{d.chars >= 10000 ? `${(d.chars / 10000).toFixed(1)} 万字` : `${d.chars} 字`}</span>
            <span>{new Date(d.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
          <div className="mt-auto flex gap-2 pt-1">
            <Link href={readerHref(d.id, 1)} className="btn !text-[13px]">
              阅读
            </Link>
            <button
              className="btn !text-[13px]"
              onClick={async () => {
                if (!confirm(`删除「${d.title}」？它的全文和卡片都会删除，不能恢复。`)) return;
                await libFetch(`/api/library/?id=${d.id}`, { method: "DELETE" }).catch((e) => alert(e.message));
                onChange();
              }}
            >
              删除
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Search() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Passage[] | null>(null);
  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    const d = await libFetch<{ results: Passage[] }>(`/api/library/search/?q=${encodeURIComponent(q.trim())}`).catch(() => ({ results: [] }));
    setRes(d.results);
  };
  return (
    <section className="space-y-3">
      <form onSubmit={run} className="flex gap-2">
        <label htmlFor="lib-search" className="sr-only">
          检索我的资料
        </label>
        <input
          id="lib-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="输入关键词，例如：处分意识"
          maxLength={100}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-ink-3"
        />
        <button className="btn btn-primary">检索</button>
      </form>
      {res && res.length === 0 && <p className="text-sm text-ink-3">没有找到。</p>}
      {res && res.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {res.map((p, i) => (
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
      )}
    </section>
  );
}
