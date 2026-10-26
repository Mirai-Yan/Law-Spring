import PracticeClient from "@/components/PracticeClient";
import { PageHeader } from "@/components/ui";
import { makeBundle } from "@/lib/bundle";
import { getIndex } from "@/lib/content";

export const metadata = { title: "练习 · 法脉·刑法学" };

export default function PracticePage() {
  return (
    <>
      <PageHeader eyebrow="练习与自测" title="按学说推演，检验自己是否真的懂了">
        <p className="max-w-3xl text-ink-2">
          题目全部由知识库自动生成，不经过大模型：给定学说推结论、给定结论找学说、识别先决问题、判断学者的学说归属。每道题只有一个正确答案，答完附推演链与出处页面。
        </p>
      </PageHeader>
      <PracticeClient bundle={makeBundle(getIndex())} />
    </>
  );
}
