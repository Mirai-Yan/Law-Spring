import ReportLink from "@/components/ReportLink";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InlineRich, termScope } from "@/components/RichText";
import TocLayout from "@/components/TocLayout";
import { LevelBadge, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { workCitation } from "@/lib/view";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIndex().db.crimes.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${getIndex().crime.get(id)?.name ?? ""} · 法脉·刑法学` };
}

export default async function CrimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ix = getIndex();
  const c = ix.crime.get(id);
  if (!c) notFound();
  const all = ix.db.crimes;
  const i = all.findIndex((x) => x.id === id);
  const prev = all[i - 1];
  const next = all[i + 1];

  const terms = termScope();
  const toc = [
    { id: "interest", label: "保护法益" },
    { id: "elements", label: "要件要点" },
    ...(c.related.length ? [{ id: "related", label: "此罪与彼罪" }] : []),
    ...(c.issues.length ? [{ id: "issues", label: "主要争点" }] : []),
  ];

  return (
    <TocLayout items={toc}>
      <PageHeader
        eyebrow={
          <Link href="/crimes/" className="hover:underline">
            罪名 · {c.chapter}
            {c.section ? ` · ${c.section}` : ""}
          </Link>
        }
        title={c.name}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {c.article ? <span className="chip">刑法{c.article}</span> : <span className="chip text-ink-3">条文号待补</span>}
          <StatusBadge item={c} />
          <ReportLink target={`crimes:${c.id}`} />
        </div>
        {c.editorNote && <p className="mt-2 text-sm text-ink-3">编者注：{c.editorNote}</p>}
      </PageHeader>

      <div className="grid gap-8 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <div className="space-y-8 md:col-span-2 lg:col-span-1 xl:col-span-2">
          <section id="interest">
            <SectionTitle sub="编者的概括，不是原文">保护法益</SectionTitle>
            {c.legalInterest ? (
              <p className="prose-cn">
                <InlineRich text={c.legalInterest} ix={ix} terms={terms} />
              </p>
            ) : (
              <p className="text-sm text-ink-3">尚未整理。</p>
            )}
          </section>
          <section id="elements">
            <SectionTitle sub="编者的概括，不是原文">要件要点</SectionTitle>
            {c.elements.length ? (
              <ul className="list-disc space-y-1.5 pl-5 text-ink-2">
                {c.elements.map((e, k) => (
                  <li key={k}>
                    <InlineRich text={e} ix={ix} terms={terms} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">尚未整理。</p>
            )}
          </section>
          {c.related.length > 0 && (
            <section id="related">
              <SectionTitle>此罪与彼罪</SectionTitle>
              <ul className="space-y-1.5 text-sm">
                {c.related.map((r) => (
                  <li key={r.crime}>
                    <Link href={`/crime/${r.crime}/`} className="link">
                      {ix.crime.get(r.crime)?.name}
                    </Link>
                    ：<InlineRich text={r.note} ix={ix} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {c.issues.length > 0 && (
            <section id="issues">
              <SectionTitle sub="这个罪名牵涉的争议问题">主要争点</SectionTitle>
              <ul className="space-y-2">
                {c.issues.map((qid) => {
                  const q = ix.question.get(qid)!;
                  return (
                    <li key={qid} className="flex flex-wrap items-center gap-2">
                      <LevelBadge level={q.level} />
                      <Link href={`/question/${qid}/`} className="font-serif hover:underline">
                        {q.text}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-4 text-sm">
          <div className="card p-4">
            <div className="mb-1 text-ink-3">书中位置</div>
            {c.sources.map((s, k) => (
              <p key={k}>
                {workCitation(ix, s.work)}，第 {s.pages} 页
              </p>
            ))}
          </div>
          <nav className="flex justify-between gap-2" aria-label="相邻罪名">
            {prev ? (
              <Link href={`/crime/${prev.id}/`} className="btn !text-[13px]">
                ← {prev.name}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/crime/${next.id}/`} className="btn !text-[13px]">
                {next.name} →
              </Link>
            )}
          </nav>
        </aside>
      </div>
    </TocLayout>
  );
}
