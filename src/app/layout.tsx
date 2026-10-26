import type { Metadata, Viewport } from "next";
import Link from "next/link";
import AccountMenu from "@/components/AccountMenu";
import { InstallButton, PwaRegister } from "@/components/Pwa";
import ThemePicker from "@/components/ThemePicker";
import Tutor from "@/components/Tutor";
import { ONLINE_DEMO } from "@/lib/deploy";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "法脉·刑法学",
  description: "按学说史组织的刑法学习工具：溯源、对话、谱系、光谱、根据论透镜与先决问题。",
  applicationName: "法脉·刑法学",
  appleWebApp: { capable: true, title: "法脉·刑法学", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// 主题切换后由 ThemePicker 改写这个颜色
export const viewport: Viewport = { themeColor: "#fcfcfb" };

const NAV = [
  { href: "/ask/", label: "提问" },
  { href: "/case/", label: "案例分析" },
  { href: "/concepts/", label: "专题" },
  { href: "/crimes/", label: "罪名" },
  { href: "/lens/", label: "透镜" },
  { href: "/practice/", label: "练习" },
  { href: "/spectrum/", label: "光谱" },
  { href: "/graph/", label: "图谱" },
  { href: "/jurisdictions/", label: "法域" },
  { href: "/scholars/", label: "学者" },
  { href: "/review/", label: "审核" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme 由 <head> 里的脚本在首次绘制前写入，与服务端渲染的 HTML 不同属正常
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="shrink-0 font-serif text-lg font-bold tracking-wide">
              法脉·刑法学
            </Link>
            <nav className="no-scrollbar -mr-4 flex min-w-0 flex-1 gap-1 overflow-x-auto pr-4 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="shrink-0 rounded-md px-2.5 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <ThemePicker />
            <AccountMenu />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-ink-3">
            内容由 AI 起草，标有「待核实」的条目尚未经人工核对原文，引用前请以原始文献为准。光谱上的位置均为编者定位。
            <Link href="/about/" className="ml-2 underline">
              关于本项目
            </Link>
            {!ONLINE_DEMO && (
              <Link href="/feedback/" className="ml-2 underline">
                建议与纠错
              </Link>
            )}
            <InstallButton className="ml-2" />
          </div>
        </footer>
        <Tutor />
        <PwaRegister />
      </body>
    </html>
  );
}
