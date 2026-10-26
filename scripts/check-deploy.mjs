/**
 * 线上演示版构建前的检查（netlify.toml 里在 npm run build 之前运行）。
 * 构建目录里不应有私有锚点、书籍与 AI 缓存、用户数据库、密钥：它们可能被打包进服务器函数。
 * 从 Git 仓库构建时这些文件本来就不存在；如果在本机直接用命令行部署，这里会拦下来。
 */
import fs from "node:fs";

const PRIVATE = ["content/_private", "content/_inbox", ".cache", "data", ".env.local"];
const found = PRIVATE.filter((p) => fs.existsSync(p));
if (found.length) {
  console.error(`线上演示版不能从含有私有文件的目录构建：${found.join("、")}。请通过 Git 仓库部署。`);
  process.exit(1);
}
console.log("部署检查通过：构建目录中没有私有文件。");
