import Link from "next/link";
import { LevelBadge, PageHeader, SectionTitle } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { AREA_LABEL, AREA_ORDER } from "@/lib/schema";
import { IconStar } from "@/components/icons";

export const metadata = { title: "专题 · 法脉·刑法学" };

export default function ConceptsPage() {
  const ix = getIndex();
  const groups = AREA_ORDER.map((a) => ({
    title: AREA_LABEL[a],
    list: ix.db.concepts
      .filter((c) => c.area === a)
      .sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "foundation" ? -1 : 1)),
  })).filter((g) => g.list.length > 0);
  return (
    <>
      <PageHeader eyebrow="专题" title={`全部 ${ix.db.concepts.length} 个专题`}>
        <p className="text-ink-2">每个专题都有溯源、对话、谱系、关系与光谱，并拆成若干个可以提问的问句。</p>
      </PageHeader>
      <div className="space-y-10">
        {groups.map((g) => (
          <section key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {g.list.map((c) => (
                <div key={c.id} className="card p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link href={`/concept/${c.id}/`} className="font-serif text-lg font-bold hover:underline">
                      {c.kind === "foundation" && <span className="mr-1 text-accent-ink"><IconStar size={13} filled /><span className="sr-only">根据论</span></span>}
                      {c.name}
                    </Link>
                    <span className="text-xs text-ink-3">{c.tradition === "common" ? "英美法系" : c.tradition === "both" ? "两大法系" : "大陆法系"}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(ix.questionsOfConcept.get(c.id) ?? []).map((q) => (
                      <li key={q.id} className="flex items-start gap-2">
                        <span className="shrink-0 scale-90"><LevelBadge level={q.level} /></span>
                        <Link href={`/question/${q.id}/`} className="hover:underline">
                          {q.text}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
