import Link from "next/link";
import { notFound } from "next/navigation";
import EvolutionLanes from "@/components/EvolutionLanes";
import TocLayout from "@/components/TocLayout";
import { JurDot, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { EVENT_TYPE_LABEL } from "@/lib/schema";
import { toLaneEvents, workCitation } from "@/lib/view";
import { IconStar } from "@/components/icons";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIndex().db.jurisdictions.map((j) => ({ id: j.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${getIndex().jurisdiction.get(id)?.name ?? ""} · 法脉·刑法学` };
}

export default async function JurisdictionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ix = getIndex();
  const j = ix.jurisdiction.get(id);
  if (!j) notFound();

  const own = ix.db.events.filter((e) => e.jurisdiction === id).sort((a, b) => a.year - b.year);
  const ownIds = new Set(own.map((e) => e.id));
  // 继受来源：本法域事件所派生自的、其他法域的事件
  const sources = new Map<string, { from: string; to: string }[]>();
  // 影响去向：其他法域中派生自本法域事件的事件
  const targets = new Map<string, { from: string; to: string }[]>();
  for (const e of ix.db.events) {
    for (const p of e.derivedFrom) {
      const pe = ix.event.get(p);
      if (!pe) continue;
      if (ownIds.has(e.id) && pe.jurisdiction !== id) {
        const l = sources.get(pe.jurisdiction) ?? [];
        l.push({ from: p, to: e.id });
        sources.set(pe.jurisdiction, l);
      }
      if (ownIds.has(p) && e.jurisdiction !== id) {
        const l = targets.get(e.jurisdiction) ?? [];
        l.push({ from: p, to: e.id });
        targets.set(e.jurisdiction, l);
      }
    }
  }
  const ctxIds = new Set([...sources.values()].flat().map((x) => x.from));
  const laneEvents = toLaneEvents(ix, [...own, ...[...ctxIds].map((x) => ix.event.get(x)!)], ctxIds);
  const scholars = ix.db.scholars.filter((s) => s.jurisdiction === id).sort((a, b) => (a.born ?? 3000) - (b.born ?? 3000));
  const works = ix.db.works.filter((w) => w.jurisdiction === id).sort((a, b) => a.year - b.year);

  const Flow = ({ map, dir }: { map: Map<string, { from: string; to: string }[]>; dir: "in" | "out" }) =>
    map.size === 0 ? (
      <p className="text-sm text-ink-3">{dir === "in" ? "没有收录来自其他法域的继受。" : "没有收录对其他法域的影响。"}</p>
    ) : (
      <ul className="space-y-3 text-sm">
        {[...map].map(([jid, links]) => (
          <li key={jid}>
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <JurDot id={jid} />
              {ix.jurisdiction.get(jid)?.name}
            </div>
            <ul className="space-y-0.5 pl-4 text-ink-2">
              {links.map((l) => (
                <li key={`${l.from}>${l.to}`}>
                  {ix.event.get(l.from)?.year} {ix.event.get(l.from)?.title}
                  <span className="mx-1.5 text-ink-3">→</span>
                  {ix.event.get(l.to)?.year} {ix.event.get(l.to)?.title}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    );

  const toc = [
    { id: "evolution", label: "学说演变" },
    { id: "flows", label: "继受来源与影响去向" },
    { id: "events", label: "事件" },
    { id: "people", label: "学者与文献" },
  ];

  return (
    <TocLayout items={toc}>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <JurDot id={id} /> {j.tradition === "common" ? "英美法系" : "大陆法系"}
          </span>
        }
        title={j.name}
      >
        <p className="max-w-3xl text-ink-2">{j.summary}</p>
      </PageHeader>

      <section id="evolution" className="mb-10">
        <SectionTitle sub="本法域的事件，以及它们所继受的其他法域事件（淡色）">学说演变</SectionTitle>
        <EvolutionLanes events={laneEvents} jurisdictions={ix.db.jurisdictions} />
      </section>

      <section id="flows" className="mb-10 grid gap-8 md:grid-cols-2">
        <div>
          <SectionTitle sub="本法域的学说从哪里来">继受来源</SectionTitle>
          <Flow map={sources} dir="in" />
        </div>
        <div>
          <SectionTitle sub="本法域的学说影响了哪里">影响去向</SectionTitle>
          <Flow map={targets} dir="out" />
        </div>
      </section>

      <section id="events" className="mb-10">
        <SectionTitle>事件</SectionTitle>
        <ol className="space-y-3">
          {own.map((e) => (
            <li key={e.id} id={e.id} data-toc-target className="card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
                <span className="tabular-nums">
                  {e.year}
                  {e.circa ? "（约）" : ""}
                </span>
                <span>{e.originOf ? <span className="inline-flex items-center gap-1"><IconStar size={12} filled />奇点</span> : EVENT_TYPE_LABEL[e.type]}</span>
                {e.concepts.map((c) => (
                  <Link key={c} href={`/concept/${c}/?tab=origin`} className="chip hover:bg-surface-2">
                    {ix.concept.get(c)?.name}
                  </Link>
                ))}
                <StatusBadge item={e} />
              </div>
              <div className="mt-1 font-serif font-bold">{e.title}</div>
              {e.description && <p className="prose-cn mt-1 text-sm text-ink-2">{e.description}</p>}
              {e.works.length > 0 && <p className="mt-1 text-xs text-ink-3">文献：{e.works.map((w) => workCitation(ix, w)).join("；")}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section id="people" className="grid gap-8 md:grid-cols-2">
        <div>
          <SectionTitle>学者</SectionTitle>
          <ul className="space-y-1 text-sm">
            {scholars.map((s) => (
              <li key={s.id}>
                <Link href={`/scholar/${s.id}/`} className="link">
                  {s.name}
                </Link>
                <span className="text-ink-3">
                  {s.nameOriginal && s.nameOriginal !== s.name ? ` ${s.nameOriginal}` : ""}
                  {s.born ? `（${s.born}–${s.died ?? ""}）` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle>文献</SectionTitle>
          <ul className="space-y-1 text-sm text-ink-2">
            {works.map((w) => (
              <li key={w.id}>{workCitation(ix, w.id)}</li>
            ))}
          </ul>
        </div>
      </section>
    </TocLayout>
  );
}
