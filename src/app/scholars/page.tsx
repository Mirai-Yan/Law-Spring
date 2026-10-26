import Link from "next/link";
import { JurDot, PageHeader } from "@/components/ui";
import { getIndex } from "@/lib/content";

export const metadata = { title: "学者 · 法脉·刑法学" };

export default function ScholarsPage() {
  const ix = getIndex();
  const jurs = [...ix.db.jurisdictions].sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHeader eyebrow="学者" title={`${ix.db.scholars.length} 位学者`}>
        <p className="text-ink-2">按法域与出生年份排列。生卒年与师承关系均待核实。</p>
      </PageHeader>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {jurs.map((j) => (
          <section key={j.id}>
            <h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-bold">
              <JurDot id={j.id} size={10} />
              {j.name}
            </h2>
            <ul className="space-y-1 text-sm">
              {ix.db.scholars
                .filter((s) => s.jurisdiction === j.id)
                .sort((a, b) => (a.born ?? 3000) - (b.born ?? 3000))
                .map((s) => (
                  <li key={s.id}>
                    <Link href={`/scholar/${s.id}/`} className="link">
                      {s.name}
                    </Link>
                    <span className="text-ink-3">
                      {s.nameOriginal && s.nameOriginal !== s.name ? ` ${s.nameOriginal}` : ""}
                      {s.born ? ` ${s.born}–${s.died ?? ""}` : ""}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
