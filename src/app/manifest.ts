import type { MetadataRoute } from "next";

/** PWA 应用清单：浏览器据此「安装」网站，显示图标、名称，并以独立窗口打开 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "法脉·刑法学",
    short_name: "法脉·刑法学",
    description: "按学说史组织的刑法学习工具：溯源、对话、谱系、光谱、根据论透镜与先决问题。",
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fcfcfb",
    theme_color: "#fcfcfb",
    categories: ["education", "books"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "提问", url: "/ask/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "案例分析", url: "/case/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "我的资料库", url: "/library/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "繁星图", url: "/graph/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
