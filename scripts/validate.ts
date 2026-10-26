/**
 * npm run validate
 * 校验 content/ 下全部 YAML：字段、引用、奇点、出处规则、先决图无环、wiki 链接。
 * 可传入其他目录：npm run validate -- path/to/content
 */
import path from "node:path";
import fs from "node:fs";
import { ANCHOR_FILE, BOOK_PAGES, checkAnchors, readAnchors, readBookPages } from "../src/lib/ingest/anchors";
import { loadContent } from "../src/lib/load";
import { validateDb } from "../src/lib/validate";

const dir = path.resolve(process.argv[2] ?? "content");
const { db, issues, locations } = loadContent(dir);

let errors = 0;
let warnings = 0;

for (const i of issues) {
  console.log(`✖ ${i.file}  ${i.message}`);
  errors++;
}

for (const f of validateDb(db)) {
  const file = locations[f.where] ? `  (${locations[f.where]})` : "";
  console.log(`${f.level === "error" ? "✖" : "⚠"} ${f.where}  ${f.message}${file}`);
  if (f.level === "error") errors++;
  else warnings++;
}

// 原文锚点：只在本机有书籍缓存时核对（其他机器上没有书，跳过）
const anchors = readAnchors(path.resolve(ANCHOR_FILE));
if (anchors.length) {
  if (fs.existsSync(path.resolve(BOOK_PAGES))) {
    const problems = checkAnchors(db, anchors, readBookPages(path.resolve(BOOK_PAGES)));
    for (const p of problems) console.log(`✖ ${p.key}  原文锚点：${p.message}`);
    errors += problems.length;
    console.log(`原文锚点 ${anchors.length} 条，${problems.length ? `${problems.length} 条对不上` : "全部在所引页码上找到"}`);
  } else {
    console.log(`原文锚点 ${anchors.length} 条：本机没有书籍缓存，跳过核对（npm run book:extract 生成缓存）`);
  }
}

const counts = Object.entries(db)
  .map(([k, v]) => `${k} ${(v as unknown[]).length}`)
  .join(" · ");
console.log(`\n${counts}`);
console.log(`${errors} 个错误，${warnings} 个警告`);
process.exit(errors ? 1 : 0);
