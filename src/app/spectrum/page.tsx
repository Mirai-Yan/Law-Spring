import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getIndex } from "@/lib/content";

export const metadata = { title: "学术光谱 · 法脉·刑法学" };

export default function SpectraPage() {
  const ix = getIndex();
  return (
    <>
      <PageHeader eyebrow="学术光谱" title="把学者放到一条轴上">
        <p className="text-ink-2">光谱上的每一个位置都是编者的解释性判断，不是事实陈述；每个位置都附有理由，可以逐条检验。</p>
      </PageHeader>
      <div className="grid gap-3 md:grid-cols-2">
        {ix.db.spectra.map((s) => (
          <Link key={s.id} href={`/spectrum/${s.id}/`} className="card block p-4 hover:bg-surface-2">
            <div className="font-serif text-lg font-bold">{s.title}</div>
            <p className="mt-1 text-sm text-ink-2">
              {s.axes[0].left} ↔ {s.axes[0].right} · {s.placements.length} 个定位
            </p>
            <p className="mt-1 text-xs text-ink-3">专题：{ix.concept.get(s.concept)?.name}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
