import "server-only";
import path from "node:path";
import { loadContent } from "./load";
import { buildIndex, type Index } from "./graph";

let cached: { ix: Index; locations: Record<string, string> } | null = null;

/** 构建时读取 content/，内容有结构错误时直接让构建失败 */
export function getContent() {
  // 开发时每次重新读取，修改 YAML 后刷新页面即可看到；构建时只读一次
  if (cached && process.env.NODE_ENV !== "development") return cached;
  const { db, issues, locations } = loadContent(path.join(process.cwd(), "content"));
  if (issues.length) {
    throw new Error(
      "内容文件解析失败，请先运行 npm run validate：\n" +
        issues.map((i) => `${i.file}: ${i.message}`).join("\n"),
    );
  }
  cached = { ix: buildIndex(db), locations };
  return cached;
}

export function getIndex(): Index {
  return getContent().ix;
}
