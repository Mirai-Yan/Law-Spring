/**
 * 大模型调用层：DeepSeek（OpenAI 兼容接口）。
 * 只在服务端（API 路由、命令行脚本）使用；API key 从环境变量读取，绝不进入前端代码。
 */

export class LlmUnavailableError extends Error {}

export function llmConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

export function llmModel(): string {
  return process.env.DEEPSEEK_MODEL || "deepseek-chat";
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** 调用一次对话补全，要求模型以 JSON 对象回答，返回解析后的对象；history 是此前的多轮对话 */
export async function chatJson({
  system,
  user,
  history = [],
  maxTokens = 2000,
  timeoutMs = 60_000,
}: {
  system: string;
  user: string;
  history?: ChatTurn[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<unknown> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new LlmUnavailableError("未配置 DEEPSEEK_API_KEY");
  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: llmModel(),
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new LlmUnavailableError(`无法连接大模型服务：${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LlmUnavailableError(`大模型服务返回 ${res.status}${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new LlmUnavailableError("大模型没有返回内容");
  try {
    return JSON.parse(content);
  } catch {
    throw new LlmUnavailableError("大模型返回的不是合法的 JSON");
  }
}
