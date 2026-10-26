import LocalOnly from "@/components/LocalOnly";
import LoginForm from "@/components/LoginForm";
import { PageHeader } from "@/components/ui";
import { ONLINE_DEMO } from "@/lib/deploy";

export const metadata = { title: "登录 · 法脉·刑法学" };

export default function LoginPage() {
  if (ONLINE_DEMO)
    return (
      <div className="mx-auto max-w-md">
        <PageHeader eyebrow="账号" title="登录或注册" />
        <LocalOnly />
      </div>
    );
  return (
    <div className="mx-auto max-w-md">
      <PageHeader eyebrow="账号" title="登录或注册">
        <p className="text-sm text-ink-2">
          不登录也能浏览全部内容。登录后，练习进度、主题、收藏和个人资料库会在你的手机、电脑和网页之间同步。
        </p>
      </PageHeader>
      <LoginForm />
    </div>
  );
}
