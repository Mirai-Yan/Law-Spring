/**
 * npm run book:extract -- <PDF 所在目录>
 * 抽取张明楷《刑法学》（第七版）四册的文字层：按页清洗、识别印刷页码、按章切分。
 * 结果只写到 .cache/books/zmk7/（被 git 忽略），不进代码库，也不随网站发布。不调用任何大模型。
 *
 * 输出：
 *   pages.jsonl   每行 {vol, pdf, page, text}，page 为印刷页码
 *   outline.json  章、节标题及其起始页
 *   chapters/第NN章.txt  按章拼接的全文，每页前标「【p. 123】」，供阅读与整理
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { headerPageNumber, normalizeCjk, smoothPageNumbers } from "../src/lib/ingest/text";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("用法：npm run book:extract -- <PDF 所在目录>");
  process.exit(1);
}
const OUT = path.resolve(".cache/books/zmk7");
const VOLS = ["第一册", "第二册", "第三册", "第四册"];

type Page = { vol: number; pdf: number; page: number; text: string };
const pages: Page[] = [];

for (const [vi, tag] of VOLS.entries()) {
  const file = fs.readdirSync(dir).find((f) => f.includes(tag) && f.toLowerCase().endsWith(".pdf"));
  if (!file) {
    console.error(`找不到${tag}的 PDF`);
    process.exit(1);
  }
  process.stdout.write(`抽取${tag}… `);
  const raw = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", path.join(dir, file), "-"], { maxBuffer: 512 * 1024 * 1024 }).toString("utf8");
  const texts = raw.split("\f");
  if (texts.at(-1)?.trim() === "") texts.pop();
  const cleaned = texts.map((t) => normalizeCjk(t));
  const nums = smoothPageNumbers(cleaned.map((t) => headerPageNumber(t)));
  cleaned.forEach((t, i) => {
    // 去掉页眉行（页码 + 书名或章名）
    const body = t.replace(/^.*\n/, (first) => (headerPageNumber(first) != null ? "" : first));
    pages.push({ vol: vi + 1, pdf: i + 1, page: nums[i], text: body });
  });
  console.log(`${texts.length} 页，印刷页码 ${nums.find((n) => n > 0)}–${nums.at(-1)}`);
}

// 每一册都附有全书目录、前言等，正文页码会在四册之间连续；同一印刷页码只保留第一次出现的正文页
const seen = new Set<number>();
const body = pages.filter((p) => {
  if (p.page <= 0 || seen.has(p.page)) return false;
  seen.add(p.page);
  return true;
});

// 章、节标题
const CN = "一二三四五六七八九十百零〇";
const outline: { level: "编" | "章" | "节"; title: string; page: number }[] = [];
for (const p of body) {
  for (const line of p.text.split("\n").slice(0, 40)) {
    const m = new RegExp(`^第([${CN}]+)(编|章|节)\\s*([^\\s／/]{2,30})$`).exec(line.trim());
    if (m && !/[／/]\s*\d+$/.test(line)) {
      const level = m[2] as "编" | "章" | "节";
      const title = `第${m[1]}${m[2]} ${m[3]}`;
      if (!outline.some((o) => o.title === title)) outline.push({ level, title, page: p.page });
    }
  }
}

// 正文里的章标题可能被 OCR 读乱；以目录中「第二章 刑法的基本原则 ／ 59」这样带页码的条目为准补全。
// 每册都附全书目录，各册 OCR 读法不一（如「贵任」「责任」），同一章号取出现最多的写法
const tocVotes = new Map<string, Map<string, number>>();
for (const p of pages) {
  for (const line of p.text.split("\n")) {
    const m = new RegExp(`^第([${CN}]+)章\\s*(.+?)\\s*[／/]\\s*([0-9 ]{1,6})$`).exec(line.trim());
    if (!m) continue;
    const key = `${m[2].replace(/\s+/g, "")}|${m[3].replace(/\s/g, "")}`;
    const votes = tocVotes.get(m[1]) ?? new Map<string, number>();
    votes.set(key, (votes.get(key) ?? 0) + 1);
    tocVotes.set(m[1], votes);
  }
}
for (const [no, votes] of tocVotes) {
  const [name, page] = [...votes].sort((x, y) => y[1] - x[1])[0][0].split("|");
  const title = `第${no}章 ${name}`;
  for (let i = outline.length - 1; i >= 0; i--) if (outline[i].level === "章" && outline[i].title.startsWith(`第${no}章`)) outline.splice(i, 1);
  outline.push({ level: "章", title, page: Number(page) });
}
outline.sort((x, y) => x.page - y.page || (x.level === "章" ? -1 : 1));

fs.mkdirSync(path.join(OUT, "chapters"), { recursive: true });
for (const f of fs.readdirSync(path.join(OUT, "chapters"))) fs.unlinkSync(path.join(OUT, "chapters", f));
fs.writeFileSync(path.join(OUT, "pages.jsonl"), body.map((p) => JSON.stringify(p)).join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "outline.json"), JSON.stringify(outline, null, 1));

const chapters = outline.filter((o) => o.level === "章");
chapters.forEach((c, i) => {
  const end = chapters[i + 1]?.page ?? Infinity;
  const txt = body
    .filter((p) => p.page >= c.page && p.page < end)
    .map((p) => `【p. ${p.page}】\n${p.text}`)
    .join("\n\n");
  const no = String(i + 1).padStart(2, "0");
  fs.writeFileSync(path.join(OUT, "chapters", `${no}-${c.title.replace(/\s+/g, "")}.txt`), txt);
});

console.log(`正文 ${body.length} 页，${chapters.length} 章、${outline.filter((o) => o.level === "节").length} 节，已写入 ${path.relative(process.cwd(), OUT)}`);
