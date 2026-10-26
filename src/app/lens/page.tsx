import { Suspense } from "react";
import LensClient from "@/components/LensClient";
import { PageHeader } from "@/components/ui";
import { makeBundle } from "@/lib/bundle";
import { getIndex } from "@/lib/content";

export const metadata = { title: "根据论透镜 · 法脉·刑法学" };

export default function LensPage() {
  const bundle = makeBundle(getIndex());
  return (
    <>
      <PageHeader eyebrow="根据论透镜" title="选定一个根据论，看它在不同问题上如何展开">
        <p className="text-ink-2">
          同一种违法观，会在偶然防卫、不能犯、过失犯、共犯等问题上推出一连串结论。透镜把这些结论和推演链摆在一起，也标出阵营内部的分歧，以及偏离阵营的学者。
        </p>
      </PageHeader>
      <Suspense fallback={<p className="text-ink-3">加载中…</p>}>
        <LensClient bundle={bundle} />
      </Suspense>
    </>
  );
}
