import Link from "next/link";
import EvolutionLanes from "@/components/EvolutionLanes";
import { JurDot, PageHeader, SectionTitle } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { toLaneEvents } from "@/lib/view";

export const metadata = { title: "法域 · 法脉·刑法学" };

export default function JurisdictionsPage() {
  const ix = getIndex();
  const jurs = [...ix.db.jurisdictions].sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHeader eyebrow="法域" title="两大法系、六个法域">
        <p className="text-ink-2">英美法系取英格兰与威尔士、美国；大陆法系取德国、日本、台湾地区、中国大陆。下图是全部演化事件，虚线是跨法域的继受与影响。</p>
      </PageHeader>
      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jurs.map((j) => (
          <Link key={j.id} href={`/jurisdiction/${j.id}/`} className="card block p-4 hover:bg-surface-2">
            <div className="flex items-center gap-2">
              <JurDot id={j.id} size={10} />
              <span className="font-serif text-lg font-bold">{j.name}</span>
              <span className="ml-auto text-xs text-ink-3">{j.tradition === "common" ? "英美法系" : "大陆法系"}</span>
            </div>
            <p className="mt-1 text-sm text-ink-2">{j.summary}</p>
          </Link>
        ))}
      </div>
      <SectionTitle sub="所有专题的事件放在一起">全部演化事件</SectionTitle>
      <EvolutionLanes events={toLaneEvents(ix, ix.db.events)} jurisdictions={ix.db.jurisdictions} />
    </>
  );
}
