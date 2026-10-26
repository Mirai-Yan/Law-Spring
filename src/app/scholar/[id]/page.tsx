import ReportLink from "@/components/ReportLink";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/RichText";
import ScholarWikiCard from "@/components/ScholarWikiCard";
import TocLayout from "@/components/TocLayout";
import { JurChip, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { answerLabel } from "@/lib/graph";
import { workCitation } from "@/lib/view";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIndex().db.scholars.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${getIndex().scholar.get(id)?.name ?? ""} · 法脉·刑法学` };
}

export default async function ScholarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ix = getIndex();
  const s = ix.scholar.get(id);
  if (!s) notFound();
  const { db } = ix;

  const students = db.scholars.filter((x) => x.teachers.includes(id));
  const influenced = db.scholars.filter((x) => x.influencedBy.includes(id));
  const works = db.works.filter((w) => w.authors.includes(id)).sort((a, b) => a.year - b.year);
  const events = db.events.filter((e) => e.scholars.includes(id)).sort((a, b) => a.year - b.year);
  const theories = db.theories.filter((t) => t.proponents.includes(id));
  const deviations = db.scholarPositions.filter((sp) => sp.scholar === id);
  const turns = db.dialogues.flatMap((d) => d.turns.filter((t) => t.scholar === id).map((t) => ({ d, t })));
  const placements = db.spectra.flatMap((sp) => sp.placements.filter((p) => p.entity === `scholar:${id}`).map((p) => ({ sp, p })));

  const People = ({ ids }: { ids: string[] }) =>
    ids.length === 0 ? (
      <span className="text-ink-3">未收录</span>
    ) : (
      <>
        {ids.map((x, i) => (
          <span key={x}>
            {i > 0 && "、"}
            <Link href={`/scholar/${x}/`} className="link">
              {ix.scholar.get(x)?.name ?? x}
            </Link>
          </span>
        ))}
      </>
    );

  const toc = [
    { id: "lineage", label: "谱系" },
    { id: "stance", label: "立场" },
    { id: "works", label: "著作" },
    ...(events.length ? [{ id: "events", label: "参与的演化事件" }] : []),
    ...(turns.length ? [{ id: "dialogue", label: "在学者对话中" }] : []),
  ];

  return (
    <TocLayout items={toc}>
      <PageHeader eyebrow="学者" title={s.name}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          {s.nameOriginal && s.nameOriginal !== s.name && <span>{s.nameOriginal}</span>}
          {s.born && (
            <span className="text-ink-3">
              {s.born}–{s.died ?? ""}
            </span>
          )}
          <JurChip id={s.jurisdiction} label={ix.jurisdiction.get(s.jurisdiction)?.name ?? s.jurisdiction} />
          {s.affiliations.map((a) => (
            <span key={a} className="chip">
              {a}
            </span>
          ))}
          <StatusBadge item={s} />
          <ReportLink target={`scholars:${s.id}`} />
        </div>
        <RichText text={s.bio} ix={ix} className="prose-cn mt-3 max-w-3xl" />
        {s.editorNote && <p className="mt-1 text-sm text-ink-3">编者注：{s.editorNote}</p>}
      </PageHeader>

      {ix.scholarWiki.get(id) && <ScholarWikiCard w={ix.scholarWiki.get(id)!} />}

      <div className="grid gap-10 md:grid-cols-2">
        <section id="lineage">
          <SectionTitle sub="师承关系最容易出错，均待核实">谱系</SectionTitle>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-ink-3">老师</dt>
              <dd><People ids={s.teachers} /></dd>
            </div>
            <div>
              <dt className="text-ink-3">学生</dt>
              <dd><People ids={students.map((x) => x.id)} /></dd>
            </div>
            <div>
              <dt className="text-ink-3">受其影响</dt>
              <dd><People ids={s.influencedBy} /></dd>
            </div>
            <div>
              <dt className="text-ink-3">影响了</dt>
              <dd><People ids={influenced.map((x) => x.id)} /></dd>
            </div>
          </dl>
        </section>

        <section id="stance">
          <SectionTitle>立场</SectionTitle>
          {theories.length === 0 && deviations.length === 0 ? (
            <p className="text-sm text-ink-3">尚未归入任何学说。</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {theories.map((t) => (
                <li key={t.id}>
                  代表 <Link href={`/lens/?theory=${t.id}`} className="link">{t.name}</Link>
                  <span className="text-ink-3">（{ix.question.get(t.question)?.text} → {answerLabel(ix, t.question, t.answer)}）</span>
                </li>
              ))}
              {deviations.map((d) => (
                <li key={d.question}>
                  <span aria-hidden>⚑ </span>在
                  <Link href={`/question/${d.question}/`} className="link">{ix.question.get(d.question)?.text}</Link>
                  上偏离{ix.theory.get(d.deviatesFrom)?.name}，主张「{answerLabel(ix, d.question, d.answer)}」
                  {d.note && <p className="mt-0.5 text-ink-3">{d.note}</p>}
                </li>
              ))}
            </ul>
          )}
          {placements.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-semibold">光谱上的位置（编者定位）</h3>
              <ul className="space-y-1 text-sm">
                {placements.map(({ sp, p }, i) => (
                  <li key={i}>
                    <Link href={`/spectrum/${sp.id}/`} className="link">{sp.title}</Link>
                    <span className="text-ink-3">
                      ：{p.year ?? ""} 年 · {Math.round(p.x * 100)}/100 · {p.rationale}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section id="works" className="mt-10">
        <SectionTitle>著作</SectionTitle>
        {works.length === 0 ? (
          <p className="text-sm text-ink-3">未收录。</p>
        ) : (
          <ul className="space-y-1 text-sm text-ink-2">
            {works.map((w) => (
              <li key={w.id}>
                {workCitation(ix, w.id)} <StatusBadge item={w} compact />
              </li>
            ))}
          </ul>
        )}
      </section>

      {events.length > 0 && (
        <section id="events" className="mt-10">
          <SectionTitle>参与的演化事件</SectionTitle>
          <ul className="space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id}>
                <span className="tabular-nums text-ink-3">{e.year}</span>{" "}
                <Link href={`/jurisdiction/${e.jurisdiction}/#${e.id}`} className="link">{e.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {turns.length > 0 && (
        <section id="dialogue" className="mt-10">
          <SectionTitle>在学者对话中</SectionTitle>
          <ul className="space-y-3 text-sm">
            {turns.map(({ d, t }) => (
              <li key={`${d.id}-${t.id}`} className="card p-3">
                <Link href={`/concept/${d.concept}/?tab=dialogue`} className="text-ink-3 hover:underline">{d.title}</Link>
                <p className="prose-cn mt-1">{t.claim}</p>
                {t.work && <p className="mt-0.5 text-xs text-ink-3">{workCitation(ix, t.work)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </TocLayout>
  );
}
