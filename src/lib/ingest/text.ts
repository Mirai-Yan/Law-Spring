/**
 * 文字抽取后的清洗与核对，书籍抽取脚本和用户上传共用。纯函数，不依赖文件系统。
 */

const CJK = "\\u2e80-\\u2fdf\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef";
const CJK_GAP = new RegExp(`([${CJK}])[ \\t\\u00a0]+(?=[${CJK}])`, "g");

/**
 * PDF 字体常把常用字映射到「康熙部首」「中日韩部首补充」码位（如「⼈」「⻚」），外观一样但检索对不上。
 * 康熙部首可以用 NFKC 还原；部首补充区没有标准对应，按字形列出常见的几个。
 */
const RADICAL_SUPPLEMENT: Record<string, string> = Object.fromEntries(
  "⺟母 ⺠民 ⺩王 ⺷羊 ⺼月 ⻄西 ⻅见 ⻆角 ⻈讠 ⻉贝 ⻋车 ⻓长 ⻔门 ⻘青 ⻚页 ⻛风 ⻜飞 ⻝食 ⻠饣 ⻢马 ⻣骨 ⻥鱼 ⻦鸟 ⻨麦 ⻩黄 ⻬齐 ⻮齿 ⻰龙 ⻳龟"
    .split(" ")
    .map((p) => [p[0], p[1]]),
);

export function fixRadicals(text: string): string {
  return text.replace(/[\u2e80-\u2eff\u2f00-\u2fdf]/g, (c) => RADICAL_SUPPLEMENT[c] ?? c.normalize("NFKC"));
}

/** 删掉中文字（含中文标点）之间 OCR 多出来的空格，压缩多余空白 */
export function normalizeCjk(text: string): string {
  let s = fixRadicals(text.replace(/\r/g, ""));
  // 两遍：第一遍处理后，原本隔着一个字的空格才露出来
  s = s.replace(CJK_GAP, "$1").replace(CJK_GAP, "$1");
  s = s.replace(/[ \t ]{2,}/g, " ");
  return s
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 从页眉识别印刷页码。
 * 奇数页形如「第一章刑法概说  31」（页码在行尾），偶数页形如「32  刑法学（第七版）」（页码在行首）；
 * OCR 可能把数字拆开，如「53 7」。
 */
export function headerPageNumber(pageText: string, bookTitle = "刑法学"): number | undefined {
  const first = pageText.split("\n").find((l) => l.trim());
  if (!first) return undefined;
  const line = first.trim();
  const lead = new RegExp(`^([0-9][0-9 ]{0,5})\\s+${bookTitle}`).exec(line);
  if (lead) return toInt(lead[1]);
  const trail = /第[一二三四五六七八九十百—-]+[章编].*?\s([0-9][0-9 ]{0,5})$/.exec(line);
  if (trail) return toInt(trail[1]);
  return undefined;
}

function toInt(s: string): number | undefined {
  const n = Number(s.replace(/\s/g, ""));
  return Number.isFinite(n) && n > 0 && n < 5000 ? n : undefined;
}

/**
 * 按「印刷页码 − PDF 页序」的众数补全页码：页眉识别失败或 OCR 读错的页，按所在册的偏移推算。
 * 输入 detected[i] 是第 i 页（从 0 起）识别到的页码。
 */
export function smoothPageNumbers(detected: (number | undefined)[]): number[] {
  const counts = new Map<number, number>();
  detected.forEach((n, i) => {
    if (n != null) counts.set(n - i, (counts.get(n - i) ?? 0) + 1);
  });
  // 一册之内偏移通常不变，但前言、目录用罗马数字或无页码，所以只取出现最多的偏移
  let offset = 0;
  let best = -1;
  for (const [o, c] of counts) if (c > best) [offset, best] = [o, c];
  return detected.map((_, i) => i + offset);
}

/** 用于比对的强归一化：去掉全部空白，统一常见标点和引号 */
export function canonical(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s ]/g, "")
    .replace(/[“”"＂「」『』]/g, "")
    .replace(/[‘’']/g, "")
    .replace(/[，,]/g, "，")
    .replace(/[；;]/g, "；")
    .replace(/[：:]/g, "：")
    .replace(/[（(]/g, "（")
    .replace(/[）)]/g, "）")
    .replace(/[—–-]+/g, "—");
}

/** 原文锚点是否出现在给定的页面文字中（允许跨到下一页，以覆盖跨页的句子） */
export function anchorFound(anchor: string, page: string, nextPage = ""): boolean {
  const a = canonical(anchor);
  if (!a) return false;
  const p = canonical(page);
  if (p.includes(a)) return true;
  // 跨页：取本页末尾与下一页开头拼接
  return nextPage ? (p.slice(-a.length * 2) + canonical(nextPage).slice(0, a.length * 2)).includes(a) : false;
}

/** 解析「p. 123」「pp. 123–125」「123-125」「123」形式的页码，返回起止 */
export function parsePages(s: string): { from: number; to: number } | undefined {
  const m = /(\d+)\s*(?:[-–—~至]\s*(\d+))?/.exec(s);
  if (!m) return undefined;
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return to >= from ? { from, to } : undefined;
}
