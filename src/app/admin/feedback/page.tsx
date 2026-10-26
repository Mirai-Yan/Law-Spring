import AdminFeedback from "@/components/AdminFeedback";
import LocalOnly from "@/components/LocalOnly";
import { PageHeader } from "@/components/ui";
import { ONLINE_DEMO } from "@/lib/deploy";

export const metadata = { title: "反馈后台 · 法脉·刑法学" };

export default function AdminFeedbackPage() {
  return (
    <>
      <PageHeader eyebrow="开发者" title="反馈后台">
        <p className="text-sm text-ink-2">只有 ADMIN_USERNAMES 中列出的账号可以查看和处理。</p>
      </PageHeader>
      {ONLINE_DEMO ? <LocalOnly /> : <AdminFeedback />}
    </>
  );
}
