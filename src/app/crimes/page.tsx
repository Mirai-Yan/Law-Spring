import CrimeIndex from "@/components/CrimeIndex";
import { PageHeader } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { workCitation } from "@/lib/view";

export const metadata = { title: "罪名 · 法脉·刑法学" };

export default function CrimesPage() {
  const ix = getIndex();
  const rows = ix.db.crimes.map((c) => ({
    id: c.id,
    name: c.name,
    chapter: c.chapter,
    section: c.section,
    article: c.article,
    pages: c.sources[0]?.pages,
    done: c.elements.length > 0 || !!c.legalInterest,
  }));
  return (
    <>
      <PageHeader eyebrow="分论" title="罪名卡片">
        <p className="max-w-3xl text-ink-2">
          按刑法分则的章、节排列，共 {rows.length} 个罪名。罪名、章节与页码取自{workCitation(ix, "zmk-xingfaxue-7")}
          的体例；保护法益与要件要点是编者的概括，全部待核实。带「·」的罪名，要点还在整理中。
        </p>
      </PageHeader>
      <CrimeIndex rows={rows} />
    </>
  );
}
