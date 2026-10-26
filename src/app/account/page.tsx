import AccountClient from "@/components/AccountClient";
import { PageHeader } from "@/components/ui";
import { ONLINE_DEMO } from "@/lib/deploy";

export const metadata = { title: `${ONLINE_DEMO ? "我的学习记录" : "我的账户"} · 法脉·刑法学` };

export default function AccountPage() {
  return (
    <>
      <PageHeader eyebrow={ONLINE_DEMO ? "本机" : "账号"} title={ONLINE_DEMO ? "我的学习记录" : "我的账户"} />
      <AccountClient />
    </>
  );
}
