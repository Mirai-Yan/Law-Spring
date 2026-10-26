import { Suspense } from "react";
import AskClient from "@/components/AskClient";
import { PageHeader } from "@/components/ui";
import { makeBundle } from "@/lib/bundle";
import { getIndex } from "@/lib/content";

export const metadata = { title: "提问 · 法脉·刑法学" };

export default function AskPage() {
  const bundle = makeBundle(getIndex());
  return (
    <>
      <PageHeader eyebrow="提问台" title="提出一个问题，看它的先决问题">
        <p className="text-ink-2">
          输入一个刑法问题。系统会在库里找到对应的问题，展开它的先决问题树，一直追到根据论，并列出与它挂钩的其他问题。
        </p>
      </PageHeader>
      <Suspense fallback={<p className="text-ink-3">加载中…</p>}>
        <AskClient bundle={bundle} />
      </Suspense>
    </>
  );
}
