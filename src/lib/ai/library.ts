import "server-only";
import type { Index } from "../graph";
import { searchLibrary, type Passage } from "../library";
import { chatJson, llmConfigured, llmModel } from "../llm";
import { makeSearcher } from "../search";
import { questionIndexText } from "./prompts";
import { looksLikeCitation } from "./schemas";

/**
 * 个人资料库里的大模型功能，只做「检索类」工作：
 * - 在我的资料里提问：只能依据检索到的段落回答，每个论断标注段落编号，编号逐一核对；
 * - 为一段文字推荐相关的库内问题：问题 id 逐一对照知识库校验。
 */

export type LibraryAnswer = { answer: string; used: number[]; passages: Passage[]; warnings: string[]; model?: string };

const MAX_PASSAGE = 700;

export function libraryAskPrompt(): string {
  return `你是法学学习者的资料助手。用户会给你一个问题，以及从用户自己上传的资料中检索到的若干编号段落。
规则：
1. 只能依据这些段落回答；段落中没有的内容，直接说「你的资料中没有谈到」，不要用自己的知识补充。
2. 每一个论断后面用 [编号] 标明依据的段落，例如「……[2]」；可以同时标多个编号。
3. 不得引用段落以外的任何文献、判例、页码或学者观点。
4. 用简体中文，简洁、准确。
5. 只输出一个 JSON 对象：{"answer": "回答正文", "used": [用到的段落编号]}。`;
}

/** 核对回答中的段落编号：只保留确实提供过的编号，并提示可疑的引注 */
export function checkAnswer(raw: unknown, passages: Passage[]): { answer: string; used: number[]; warnings: string[] } {
  const warnings: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as { answer?: unknown };
  let answer = typeof o.answer === "string" ? o.answer.trim() : "";
  const used = new Set<number>();
  let bad = 0;
  answer = answer.replace(/\[(\d+)\]/g, (m, n) => {
    const k = Number(n);
    if (k >= 1 && k <= passages.length) {
      used.add(k);
      return m;
    }
    bad++;
    return "";
  });
  if (bad) warnings.push(`回答中有 ${bad} 处标注了不存在的段落编号，已删除。`);
  if (answer && used.size === 0) warnings.push("回答没有标注任何依据段落，请对照下方原文自行判断。");
  // 资料标题以外的书名号文献，视为可疑引注
  const titles = passages.map((p) => p.title);
  const foreign = [...answer.matchAll(/《([^》]{2,40})》/g)].map((m) => m[1]).filter((t) => !titles.some((x) => x.includes(t) || t.includes(x)));
  if (foreign.length || (looksLikeCitation(answer) && !titles.length)) warnings.push("回答中出现了资料以外的文献名，请勿采信。");
  return { answer, used: [...used].sort((a, b) => a - b), warnings };
}

export async function askLibrary(userId: number, q: string): Promise<LibraryAnswer> {
  const passages = searchLibrary(userId, q, 8, true);
  if (!passages.length) return { answer: "", used: [], passages, warnings: ["没有在你的资料里检索到相关段落。"] };
  if (!llmConfigured()) return { answer: "", used: [], passages: strip(passages), warnings: ["未配置大模型：下面只列出检索到的段落。"] };
  const user = `问题：${q}\n\n段落：\n${passages
    .map((p, i) => `[${i + 1}]《${p.title}》第 ${p.page} 页：${(p.text ?? p.snippet).slice(0, MAX_PASSAGE)}`)
    .join("\n\n")}`;
  const raw = await chatJson({ system: libraryAskPrompt(), user, maxTokens: 1200 });
  return { ...checkAnswer(raw, passages), passages: strip(passages), model: llmModel() };
}

function strip(ps: Passage[]): Passage[] {
  return ps.map((p) => ({ docId: p.docId, title: p.title, page: p.page, snippet: p.snippet }));
}

/** 为一段文字推荐相关的库内问题；没有大模型时退回关键词检索 */
export async function suggestQuestions(ix: Index, text: string): Promise<{ ids: string[]; via: "ai" | "search" }> {
  const t = text.slice(0, 1500);
  if (llmConfigured()) {
    try {
      const raw = (await chatJson({
        system: `你帮助法学学习者把一段资料对应到知识库中的问题。下面是库内问题索引：\n${questionIndexText(ix)}\n\n只能从索引中选择问题 id，最多 5 个；没有合适的就返回空数组。只输出 JSON：{"ids": ["问题 id"]}`,
        user: `资料段落：\n${t}`,
        maxTokens: 300,
      })) as { ids?: unknown };
      const ids = (Array.isArray(raw.ids) ? raw.ids : []).filter((x): x is string => typeof x === "string" && ix.question.has(x));
      return { ids: [...new Set(ids)].slice(0, 5), via: "ai" };
    } catch {
      /* 退回检索 */
    }
  }
  const search = makeSearcher(ix.db.questions, ix.db.concepts);
  const hits = new Map<string, number>();
  for (const s of t.split(/[。！？\n]/).filter((x) => x.length >= 6).slice(0, 12))
    for (const h of search(s, 3)) hits.set(h.question.id, Math.max(hits.get(h.question.id) ?? 0, h.score));
  return {
    ids: [...hits]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id),
    via: "search",
  };
}
