import "server-only";
import { normalizeCjk } from "./text";

/**
 * 上传文件的文字抽取：PDF 按页；Word、纯文本按段落切成约 1500 字的「页」。
 * 只抽取文字层，不做 OCR；扫描版 PDF 会被识别出来并提示。
 */

export type DocKind = "pdf" | "docx" | "txt" | "md";
export type Extracted = { kind: DocKind; pages: string[] };

export class ExtractError extends Error {}

const PAGE_CHARS = 1500;

export function kindOf(filename: string): DocKind | null {
  const ext = filename.toLowerCase().split(".").pop();
  return ext === "pdf" || ext === "docx" || ext === "txt" || ext === "md" ? ext : null;
}

/** 把一段长文按段落切成约 1500 字的若干页 */
export function paginate(text: string): string[] {
  const paras = normalizeCjk(text).split(/\n{2,}|\n(?=\s*[（(]?[一二三四五六七八九十\d]+[、.．)）])/);
  const pages: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > PAGE_CHARS) {
      pages.push(cur.trim());
      cur = "";
    }
    // 超长段落再按句子切
    if (p.length > PAGE_CHARS * 1.5) {
      for (const s of p.match(/[^。！？]+[。！？]?/g) ?? [p]) {
        if (cur.length + s.length > PAGE_CHARS) {
          pages.push(cur.trim());
          cur = "";
        }
        cur += s;
      }
    } else cur += (cur ? "\n\n" : "") + p;
  }
  if (cur.trim()) pages.push(cur.trim());
  return pages;
}

async function extractPdf(data: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let s = "";
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
      s += it.str ?? "";
      if (it.hasEOL) s += "\n";
    }
    pages.push(normalizeCjk(s));
    page.cleanup();
  }
  await doc.loadingTask.destroy();
  return pages;
}

export async function extractDocument(buf: Buffer, filename: string): Promise<Extracted> {
  const kind = kindOf(filename);
  if (!kind) throw new ExtractError("只支持 PDF、DOCX、TXT、MD 文件");
  let pages: string[];
  if (kind === "pdf") {
    try {
      pages = await extractPdf(new Uint8Array(buf));
    } catch {
      throw new ExtractError("无法读取这个 PDF（可能已加密或已损坏）");
    }
    const chars = pages.reduce((n, p) => n + p.replace(/\s/g, "").length, 0);
    if (chars < pages.length * 20) throw new ExtractError("这个 PDF 几乎没有文字层，可能是扫描件；需要 OCR，暂不支持");
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    pages = paginate(value);
  } else {
    pages = paginate(buf.toString("utf8"));
  }
  pages = pages.map((p) => p.trim());
  if (!pages.some((p) => p.length > 0)) throw new ExtractError("没有从文件中读到文字");
  return { kind, pages };
}
