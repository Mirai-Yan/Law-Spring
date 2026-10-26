import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 比赛版本需要运行 /api/case、/api/ask（调用 DeepSeek），因此以 Node 服务器方式运行（next build + next start），
  // 不再使用纯静态导出。内容页面仍在构建时预渲染。
  trailingSlash: true,
  images: { unoptimized: true },
  // SQLite 驱动是原生模块；pdf.js 在运行时按相对路径加载 worker，打包后会找不到。三者都不参与打包
  serverExternalPackages: ["better-sqlite3", "pdfjs-dist", "mammoth"],
  // 线上演示版开关（见 src/lib/deploy.ts）：构建时写进代码，Netlify 的服务器函数运行时读不到构建环境变量
  env: { FM_ONLINE_DEMO: process.env.FM_ONLINE_DEMO ?? "" },
  // 接口在运行时读取 content/ 的 YAML 与示例案情，部署到 Netlify 等平台时要一并打包；
  // 私有锚点、草稿箱、书籍与 AI 缓存、用户数据库、密钥一律不打包。
  // 注意：Next 按「路径中包含」匹配排除规则，且键 "*" 会连 Next 自身的服务器文件一起排除，
  // 写成 "data/**" 会误删 next/dist/lib/metadata/…，导致线上崩溃。所以键只匹配页面与接口，规则写到具体文件。
  outputFileTracingIncludes: { "/**/*": ["./content/**/*.yaml", "./content/_demo/**"] },
  outputFileTracingExcludes: {
    "/**/*": ["content/_private/**", "content/_inbox/**", ".cache/ai/**", ".cache/books/**", ".cache/wikidata/**", "data/app.db*", ".env.local"],
  },
  // Service Worker 本身不能被浏览器长期缓存，否则更新不到
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] }];
  },
};

export default nextConfig;
