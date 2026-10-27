/**
 * AI 分析的编排：缓存 → 实时调用 DeepSeek → 预置演示结果（仅案例分析）。
 * 所有结果在返回前都会重新对照知识库校验，库更新后旧缓存也不会带进失效的 id。
 */
import fs from "node:fs";
import path from "node:path";
import type { Index } from "../graph";
import { chatJson, llmConfigured, llmModel, LlmUnavailableError, type ChatTurn } from "../llm";
import { cacheKey, readCache, writeCache } from "./cache";
import { askSystemPrompt, caseBriefSystemPrompt, caseSystemPrompt } from "./prompts";
import { validateAskResult, validateCaseBrief, validateCaseResult, type AskResult, type CaseBrief, type CaseResult } from "./schemas";

export type AiSource = "ai" | "cache" | "demo";

export const MAX_CASE_CHARS = 2000;
/** 案情确认的对话：最多来回几轮、每轮多长 */
export const MAX_BRIEF_TURNS = 16;
export const MAX_BRIEF_TURN_CHARS = 3000;
export const MAX_ASK_CHARS = 200;

/** sample：口语化的示例，只用来填进输入框演示「确认案情」，没有预置的分析结果 */
export type DemoCase = { id: string; title: string; text: string; preset?: boolean; sample?: boolean; result: unknown; brief?: unknown };

const norm = (s: string) => s.replace(/\s+/g, "").trim();

export function loadDemoCases(): DemoCase[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "_demo", "cases.json"), "utf8"));
    return raw.cases as DemoCase[];
  } catch {
    return [];
  }
}

/** 内置示例的预置分析结果；不调用大模型。没有访问口令的访客也能看 */
export function presetCaseResult(ix: Index, text: string): { source: "demo"; result: CaseResult } | null {
  const demo = loadDemoCases().find((d) => d.result && norm(d.text) === norm(text));
  return demo ? { source: "demo", result: validateCaseResult(ix, demo.result) } : null;
}

/** 内置口语化示例的预置第一轮整理结果；之后的轮次需要大模型 */
export function presetCaseBrief(text: string, turns: ChatTurn[]): { source: "demo"; brief: CaseBrief } | null {
  const demo = turns.length === 0 ? loadDemoCases().find((d) => d.brief && norm(d.text) === norm(text)) : undefined;
  return demo ? { source: "demo", brief: validateCaseBrief(demo.brief) } : null;
}

export async function analyzeCase(
  ix: Index,
  text: string,
  opts: { refresh?: boolean } = {},
): Promise<{ source: AiSource; result: CaseResult; model?: string }> {
  const key = cacheKey("case", llmModel(), norm(text));
  if (!opts.refresh) {
    const cached = readCache(key);
    if (cached) return { source: "cache", result: validateCaseResult(ix, cached), model: llmModel() };
  }
  let error: Error | undefined;
  if (llmConfigured()) {
    try {
      const raw = await chatJson({ system: caseSystemPrompt(ix), user: `案情如下：\n${text}`, maxTokens: 1800 });
      const result = validateCaseResult(ix, raw);
      writeCache(key, raw);
      return { source: "ai", result, model: llmModel() };
    } catch (e) {
      error = e as Error;
    }
  }
  const preset = presetCaseResult(ix, text);
  if (preset) return preset;
  throw error ?? new LlmUnavailableError("未配置 DEEPSEEK_API_KEY，且这不是内置的示例案情");
}

/**
 * 案情整理的一轮：turns 是此前的对话（用户的回答与 AI 上一轮的整理结果交替出现），
 * 第一轮为空。断网或未配置模型时，内置示例退回预置的第一轮整理结果。
 */
export async function briefCase(
  text: string,
  turns: ChatTurn[],
): Promise<{ source: AiSource; brief: CaseBrief; model?: string }> {
  const first: ChatTurn = { role: "user", content: `用户描述的案情原文：\n${text}` };
  const all = [first, ...turns];
  const key = cacheKey("brief", llmModel(), JSON.stringify(all.map((t) => [t.role, norm(t.content)])));
  const cached = readCache(key);
  if (cached) return { source: "cache", brief: validateCaseBrief(cached), model: llmModel() };
  let error: Error | undefined;
  if (llmConfigured()) {
    try {
      const last = all[all.length - 1];
      const raw = await chatJson({ system: caseBriefSystemPrompt(), history: all.slice(0, -1), user: last.content, maxTokens: 1500 });
      const brief = validateCaseBrief(raw);
      writeCache(key, raw);
      return { source: "ai", brief, model: llmModel() };
    } catch (e) {
      error = e as Error;
    }
  }
  const preset = presetCaseBrief(text, turns);
  if (preset) return preset;
  throw error ?? new LlmUnavailableError("未配置 DEEPSEEK_API_KEY，且这不是内置的示例案情");
}

export async function analyzeAsk(
  ix: Index,
  query: string,
): Promise<{ source: AiSource; result: AskResult; model?: string }> {
  const key = cacheKey("ask", llmModel(), norm(query));
  const cached = readCache(key);
  if (cached) return { source: "cache", result: validateAskResult(ix, cached, query), model: llmModel() };
  if (!llmConfigured()) throw new LlmUnavailableError("未配置 DEEPSEEK_API_KEY");
  const raw = await chatJson({ system: askSystemPrompt(ix), user: `用户的问题：${query}`, maxTokens: 1500 });
  const result = validateAskResult(ix, raw, query);
  writeCache(key, raw);
  return { source: "ai", result, model: llmModel() };
}
