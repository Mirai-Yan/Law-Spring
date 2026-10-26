import FeedbackClient from "@/components/FeedbackClient";
import LocalOnly from "@/components/LocalOnly";
import { PageHeader } from "@/components/ui";
import { ONLINE_DEMO } from "@/lib/deploy";

export const metadata = { title: "建议与纠错 · 法脉·刑法学" };

export default function FeedbackPage() {
  return (
    <>
      <PageHeader eyebrow="反馈" title="建议与纠错">
        {!ONLINE_DEMO && (
          <p className="max-w-3xl text-ink-2">
            发现内容有误、出处不对，或者对功能有想法，都可以在这里告诉开发者。不登录也能提交；登录后可以在这里看到处理进度和回复。
          </p>
        )}
      </PageHeader>
      {ONLINE_DEMO ? <LocalOnly /> : <FeedbackClient />}
    </>
  );
}
