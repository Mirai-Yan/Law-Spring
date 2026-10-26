import ReportLink from "@/components/ReportLink";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookmarkButton from "@/components/BookmarkButton";
import ConceptGraph from "@/components/ConceptGraph";
import DialogueThread from "@/components/DialogueThread";
import EvolutionLanes from "@/components/EvolutionLanes";
import Genealogy from "@/components/Genealogy";
import QuestionWorkbench from "@/components/QuestionWorkbench";
import { InlineRich, RichText, termScope } from "@/components/RichText";
import SpectrumView from "@/components/SpectrumView";
import Tabs from "@/components/Tabs";
import { Empty, LevelBadge, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { makeBundle } from "@/lib/bundle";
import { getIndex } from "@/lib/content";
import { answerLabel } from "@/lib/graph";
import { AREA_LABEL, RELATION_LABEL } from "@/lib/schema";
import { conceptGraphData, conceptLaneEvents, conceptScholarIds, genealogyData, spectrumEntities } from "@/lib/view";
import { IconStar } from "@/components/icons";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIndex().db.concepts.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${getIndex().concept.get(id)?.name ?? ""} · 法脉·刑法学` };
}

const TABS = [
  { id: "overview", label: "概览" },
  { id: "prereq", label: "先决与挂钩" },
  { id: "origin", label: "溯源" },
  { id: "dialogue", label: "对话" },
  { id: "genealogy", label: "谱系" },
  { id: "relations", label: "关系" },
  { id: "spectrum", label: "光谱" },
];

export default async function ConceptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ix = getIndex();
  const c = ix.concept.get(id);
  if (!c) notFound();

  const levelRank = { applied: 0, intermediate: 1, foundation: 2 } as const;
  const questions = [...(ix.questionsOfConcept.get(id) ?? [])];
  const mainQ = [...questions].sort((a, b) => levelRank[a.level] - levelRank[b.level])[0];
  const theories = ix.db.theories.filter((t) => questions.some((q) => q.id === t.question));
  const dialogues = ix.db.dialogues.filter((d) => d.concept === id);
  const spectra = ix.db.spectra.filter((s) => s.concept === id);
  const laneEvents = conceptLaneEvents(ix, id);
  const gen = genealogyData(ix, conceptScholarIds(ix, id));
  const local = conceptGraphData(ix, id);
  const origin = ix.db.events.find((e) => e.originOf === id);

  // 概念层面的上下游（由问题层先决关系汇总）
  const upstream = new Map<string, number>();
  const downstreamC = new Map<string, number>();
  for (const p of ix.db.prerequisites) {
    const a = ix.question.get(p.requires)?.concept;
    const b = ix.question.get(p.question)?.concept;
    if (!a || !b || a === b) continue;
    if (b === id) upstream.set(a, (upstream.get(a) ?? 0) + 1);
    if (a === id) downstreamC.set(b, (downstreamC.get(b) ?? 0) + 1);
  }

  const orig = [c.original.de && `德 ${c.original.de}`, c.original.ja && `日 ${c.original.ja}`, c.original.en && `英 ${c.original.en}`].filter(Boolean);

  return (
    <>
      <PageHeader eyebrow={`${AREA_LABEL[c.area]} · ${c.kind === "foundation" ? "根据论" : "具体问题"}`} title={c.name}>
        <div className="flex flex-wrap items-center gap-2">
          {orig.map((o) => (
            <span key={o as string} className="chip">
              {o}
            </span>
          ))}
          <StatusBadge item={c} />
          <BookmarkButton href={`/concept/${c.id}/`} title={c.name} kind="专题" />
          <ReportLink target={`concepts:${c.id}`} />
        </div>
        <RichText text={c.summary} ix={ix} terms={termScope()} className="prose-cn mt-3 max-w-3xl text-ink-2" />
        {!origin && c.originPending && (
          <p className="mt-3 text-sm text-ink-3">
            <span className="inline-flex items-center gap-1 text-accent-ink"><IconStar size={13} />奇点待考：</span>这个专题的学说史起点尚未考证，暂不标注。
          </p>
        )}
        {origin && (
          <p className="mt-3 text-sm">
            <span className="inline-flex items-center gap-1 text-accent-ink"><IconStar size={13} filled />奇点：</span>
            {origin.year}
            {origin.circa ? "（约）" : ""} · {ix.jurisdiction.get(origin.jurisdiction)?.name} · {origin.title}
          </p>
        )}
      </PageHeader>

      <Tabs tabs={TABS} vertical>
        {/* 概览 */}
        <div className="space-y-10">
          <section>
            <SectionTitle sub="从根据论读起，再到中间问题和具体问题；每个问题都有自己的学习导引">学习路线</SectionTitle>
            <ol className="ladder">
              {[...questions]
                .sort((a, b) => levelRank[b.level] - levelRank[a.level] || (ix.questionOrder.get(a.id) ?? 0) - (ix.questionOrder.get(b.id) ?? 0))
                .map((q, i) => {
                  const pre = ix.prereqsOf.get(q.id)?.length ?? 0;
                  return (
                    <li key={q.id} className="rung" data-state={i === 0 ? "done" : "current"}>
                      <span className="rung-n" aria-hidden>
                        {i + 1}
                      </span>
                      <div className="card min-w-0 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {i === 0 && <span className="chip" style={{ background: "var(--accent-soft)", borderColor: "transparent", color: "var(--accent-ink)" }}>从这里开始</span>}
                          <LevelBadge level={q.level} />
                          <Link href={`/question/${q.id}/`} className="font-serif font-semibold hover:underline">
                            {q.text}
                          </Link>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-3">
                          <span>{q.answers.map((a) => a.label).join(" / ")}</span>
                          <span>{pre ? `先要回答 ${pre} 个先决问题` : "没有先决问题"}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ol>
          </section>
          {theories.length > 0 && (
            <section>
              <SectionTitle sub="以本专题的根据论问题为出发点的学说">学说</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {theories.map((t) => (
                  <div key={t.id} className="card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/lens/?theory=${t.id}`} className="font-serif text-lg font-bold hover:underline">
                        {t.name}
                      </Link>
                      <span className="text-sm text-ink-3">→ {answerLabel(ix, t.question, t.answer)}</span>
                    </div>
                    <p className="prose-cn mt-1 text-sm text-ink-2">
                      <InlineRich text={t.thesis} ix={ix} />
                    </p>
                    <Link href={`/lens/?theory=${t.id}`} className="link mt-2 inline-block text-sm">
                      用透镜看它在各问题上的结论 →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 先决与挂钩 */}
        <div className="space-y-10">
          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <SectionTitle sub="本专题的问题以这些专题的问题为先决">上游专题</SectionTitle>
              {upstream.size === 0 ? (
                <Empty>没有上游专题——这是一个起点。</Empty>
              ) : (
                <ul className="space-y-1 text-sm">
                  {[...upstream].map(([cid, n]) => (
                    <li key={cid}>
                      <Link href={`/concept/${cid}/`} className="link">
                        {ix.concept.get(cid)?.name}
                      </Link>
                      <span className="text-ink-3">（{n} 条先决关系）</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <SectionTitle sub="这些专题的问题以本专题的问题为先决">下游专题</SectionTitle>
              {downstreamC.size === 0 ? (
                <Empty>没有下游专题。</Empty>
              ) : (
                <ul className="space-y-1 text-sm">
                  {[...downstreamC].map(([cid, n]) => (
                    <li key={cid}>
                      <Link href={`/concept/${cid}/`} className="link">
                        {ix.concept.get(cid)?.name}
                      </Link>
                      <span className="text-ink-3">（{n} 条先决关系）</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          {mainQ && (
            <section>
              <div className="eyebrow mb-1">以本专题的核心问题为例</div>
              <QuestionWorkbench bundle={makeBundle(ix)} questionId={mainQ.id} showHeader />
              {questions.length > 1 && (
                <p className="mt-4 text-sm text-ink-2">
                  本专题的其他问题：
                  {questions
                    .filter((q) => q.id !== mainQ.id)
                    .map((q, i) => (
                      <span key={q.id}>
                        {i > 0 && "；"}
                        <Link href={`/question/${q.id}/`} className="link">
                          {q.text}
                        </Link>
                      </span>
                    ))}
                </p>
              )}
            </section>
          )}
        </div>

        {/* 溯源 */}
        <section>
          <SectionTitle sub="横轴是年份，每条泳道是一个法域；点击事件查看详情，「逐步回溯」从当下一路走回奇点。淡色节点是来自其他专题的背景事件。">
            演化与溯源
          </SectionTitle>
          {laneEvents.length === 0 ? (
            <Empty>还没有收录演化事件。</Empty>
          ) : (
            <EvolutionLanes events={laneEvents} jurisdictions={ix.db.jurisdictions} conceptId={id} />
          )}
        </section>

        {/* 对话 */}
        <section className="space-y-4">
          <SectionTitle sub="谁提出主张、谁作出回应；每一回合都附出处">学者对话</SectionTitle>
          {dialogues.length === 0 ? <Empty>还没有收录这个专题下的学者对话。</Empty> : dialogues.map((d) => <DialogueThread key={d.id} d={d} ix={ix} />)}
        </section>

        {/* 谱系 */}
        <section>
          <SectionTitle sub="与本专题相关的学者，以及他们的老师、学生与思想来源">学术谱系</SectionTitle>
          <Genealogy scholars={gen.scholars} edges={gen.edges} theories={gen.theories} jurisdictions={ix.db.jurisdictions} />
        </section>

        {/* 关系 */}
        <section className="space-y-6">
          <SectionTitle sub="与本专题直接相连的概念">概念关系</SectionTitle>
          <ul className="space-y-2">
            {ix.db.relations
              .filter((r) => r.from === id || r.to === id)
              .map((r, i) => {
                const other = r.from === id ? r.to : r.from;
                return (
                  <li key={i} className="card p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip">{RELATION_LABEL[r.type]}</span>
                      <Link href={`/concept/${other}/`} className="font-semibold hover:underline">
                        {ix.concept.get(other)?.name}
                      </Link>
                      <StatusBadge item={r} compact />
                    </div>
                    {r.description && (
                      <p className="mt-1 text-ink-2">
                        <InlineRich text={r.description} ix={ix} />
                      </p>
                    )}
                  </li>
                );
              })}
          </ul>
          {local.nodes.length > 1 && <ConceptGraph nodes={local.nodes} edges={local.edges} height={420} />}
          <p className="text-sm">
            <Link href="/graph/" className="link">
              打开全局概念图谱 →
            </Link>
          </p>
        </section>

        {/* 光谱 */}
        <section className="space-y-6">
          {spectra.length === 0 ? (
            <Empty>
              这个专题还没有自己的光谱。可以看{" "}
              <Link href="/spectrum/" className="link">
                已有的学术光谱
              </Link>
              。
            </Empty>
          ) : (
            spectra.map((s) => (
              <div key={s.id}>
                <SectionTitle sub={s.description}>{s.title}</SectionTitle>
                <SpectrumView spectrum={s} entities={spectrumEntities(ix, s)} jurisdictions={ix.db.jurisdictions} />
              </div>
            ))
          )}
        </section>
      </Tabs>
    </>
  );
}

