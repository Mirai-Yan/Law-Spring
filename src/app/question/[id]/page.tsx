import ReportLink from "@/components/ReportLink";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookViews from "@/components/BookViews";
import BookmarkButton from "@/components/BookmarkButton";
import LearningGuide from "@/components/LearningGuide";
import MyLibraryPanel from "@/components/MyLibraryPanel";
import QuestionWorkbench from "@/components/QuestionWorkbench";
import { InlineRich, RichText, termScope } from "@/components/RichText";
import TocLayout from "@/components/TocLayout";
import { LevelBadge, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { makeBundle } from "@/lib/bundle";
import { getIndex } from "@/lib/content";
import { ONLINE_DEMO } from "@/lib/deploy";
import { answerLabel, theoryAnswer } from "@/lib/graph";
import { guideData } from "@/lib/guide";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIndex().db.questions.map((q) => ({ id: q.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = getIndex().question.get(id);
  return { title: q ? `${q.text} · 法脉·刑法学` : "法脉·刑法学" };
}

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ix = getIndex();
  const q = ix.question.get(id);
  if (!q) notFound();
  const concept = ix.concept.get(q.concept)!;
  const bundle = makeBundle(ix);
  const guide = guideData(ix, q.id)!;

  const stances = ix.db.theories
    .map((t) => ({ t, ta: theoryAnswer(ix, t.id, q.id) }))
    .filter((x) => x.ta);
  const deviations = ix.db.scholarPositions.filter((sp) => sp.question === q.id);
  const hasBook = (ix.bookViewsOfQuestion.get(q.id) ?? []).length > 0;

  // 每个区块各自标注词条：同一区块里一个词只在第一次出现时加下划线
  const headTerms = termScope();
  const answerTerms = termScope();
  const stanceTerms = termScope();

  const toc = [
    { id: "guide", label: "学习导引" },
    { id: "answers", label: "可能的答案" },
    { id: "prereq", label: "先决问题" },
    { id: "hooks", label: "学习顺序与挂钩" },
    ...(hasBook ? [{ id: "book", label: "教科书中的论述" }] : []),
    { id: "stances", label: "各学说的立场" },
    ...(ONLINE_DEMO ? [] : [{ id: "library", label: "我的资料" }]),
  ];

  return (
    <TocLayout items={toc}>
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={`/concept/${concept.id}/`} className="hover:underline">
              专题 · {concept.name}
            </Link>
          </span>
        }
        title={q.text}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge level={q.level} />
          <StatusBadge item={q} />
          <BookmarkButton href={`/question/${q.id}/`} title={q.text} kind="问题" />
          <ReportLink target={`questions:${q.id}`} />
        </div>
        {q.summary && <RichText text={q.summary} ix={ix} terms={headTerms} className="prose-cn mt-3 text-ink-2" />}
      </PageHeader>

      <LearningGuide bundle={bundle} data={guide} />

      <div className="mb-8 flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-border" />
        以下是这道题的完整资料
        <span className="h-px flex-1 bg-border" />
      </div>

      <section id="answers" className="mb-10">
        <SectionTitle sub="这个问题的几种回答">可能的答案</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {q.answers.map((a) => (
            <li key={a.id} className="card p-3">
              <div className="font-serif font-semibold">{a.label}</div>
              {a.summary && (
                <p className="mt-1 text-sm text-ink-2">
                  <InlineRich text={a.summary} ix={ix} terms={answerTerms} />
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section id="prereq" className="mb-10">
        <QuestionWorkbench bundle={bundle} questionId={q.id} hooksId="hooks" />
      </section>

      <BookViews ix={ix} views={ix.bookViewsOfQuestion.get(q.id) ?? []} terms={termScope()} />

      <section id="stances" className="mb-10">
        <SectionTitle sub="各根据论在这个问题上推出的结论；点学说名进入透镜">各学说的立场</SectionTitle>
        {stances.length === 0 ? (
          <p className="text-sm text-ink-3">尚未收录各学说在此问题上的立场。</p>
        ) : (
          <div className="space-y-3">
            {stances.map(({ t, ta }) => (
              <div key={t.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/lens/?theory=${t.id}`} className="font-serif font-semibold hover:underline">
                    {t.name}
                  </Link>
                  <span aria-hidden className="text-ink-3">→</span>
                  <span className="font-medium text-accent-ink">{answerLabel(ix, q.id, ta!.answer)}</span>
                  {ta!.own && <span className="chip">这是该学说本身的主张</span>}
                  {ta!.position && <StatusBadge item={ta!.position} />}
                  {ta!.position && <ReportLink target={`positions:${t.id}@${q.id}`} />}
                </div>
                {ta!.position?.derivation.length ? (
                  <ol className="mt-2 flex flex-wrap items-center gap-1 text-sm text-ink-2">
                    {ta!.position.derivation.map((d, i) => (
                      <li key={i} className="flex items-center gap-1">
                        {i > 0 && <span aria-hidden className="text-ink-3">→</span>}
                        <InlineRich text={d} ix={ix} terms={stanceTerms} />
                      </li>
                    ))}
                  </ol>
                ) : null}
                {ta!.position?.note && (
                  <p className="mt-1 text-sm text-ink-3">
                    <InlineRich text={ta!.position.note} ix={ix} />
                  </p>
                )}
                {ta!.position?.alternatives.map((a, i) => (
                  <p key={i} className="mt-1 text-sm text-ink-3">
                    阵营内另说「{answerLabel(ix, q.id, a.answer)}」：<InlineRich text={a.note} ix={ix} />
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
        {deviations.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">偏离阵营的个别学者</h3>
            <ul className="space-y-2 text-sm">
              {deviations.map((d) => (
                <li key={d.scholar} className="card p-3">
                  <span aria-hidden>⚑ </span>
                  <Link href={`/scholar/${d.scholar}/`} className="font-medium hover:underline">
                    {ix.scholar.get(d.scholar)?.name}
                  </Link>
                  （通常归入{ix.theory.get(d.deviatesFrom)?.name}）主张「{answerLabel(ix, q.id, d.answer)}」
                  <StatusBadge item={d} compact />
                  {d.note && <p className="mt-1 text-ink-2">{d.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <MyLibraryPanel questionId={q.id} query={q.text} />
    </TocLayout>
  );
}
