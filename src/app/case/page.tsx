import CaseClient from "@/components/CaseClient";
import { PageHeader } from "@/components/ui";
import { loadDemoCases } from "@/lib/ai/analyze";
import { makeBundle } from "@/lib/bundle";
import { getIndex } from "@/lib/content";

export const metadata = { title: "案例分析 · 法脉·刑法学" };

export default function CasePage() {
  const all = loadDemoCases();
  const demos = all.filter((d) => !d.sample).map(({ id, title, text }) => ({ id, title, text }));
  const sample = all.find((d) => d.sample);
  return (
    <>
      <PageHeader eyebrow="案例分析" title="说一段案情，先确认，再看它牵动哪些学说争点">
        <p className="max-w-3xl text-ink-2">
          大模型负责读懂案情、找出争点，并对应到知识库中的问题；每个争点下，各学说的结论、推演链与先决问题全部来自经过审核的知识库。
        </p>
      </PageHeader>
      <CaseClient bundle={makeBundle(getIndex())} demos={demos} sample={sample && { id: sample.id, title: sample.title, text: sample.text }} />
    </>
  );
}
