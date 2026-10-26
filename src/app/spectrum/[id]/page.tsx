import Link from "next/link";
import { notFound } from "next/navigation";
import SpectrumView from "@/components/SpectrumView";
import { PageHeader } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { spectrumEntities } from "@/lib/view";

export const dynamicParams = false;

export function generateStaticParams() {
  return getIndex().db.spectra.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${getIndex().spectrum.get(id)?.title ?? ""} · 法脉·刑法学` };
}

export default async function SpectrumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ix = getIndex();
  const s = ix.spectrum.get(id);
  if (!s) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/concept/${s.concept}/`} className="hover:underline">
            学术光谱 · {ix.concept.get(s.concept)?.name}
          </Link>
        }
        title={s.title}
      >
        {s.description && <p className="max-w-3xl text-ink-2">{s.description}</p>}
      </PageHeader>
      <SpectrumView spectrum={s} entities={spectrumEntities(ix, s)} jurisdictions={ix.db.jurisdictions} />
    </>
  );
}
