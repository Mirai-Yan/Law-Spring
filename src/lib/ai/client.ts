"use client";

/** 浏览器端调用 AI 接口：自动附带访问口令（如果服务器要求），401 时提示输入 */
const CODE_KEY = "crimlaw-access-code";

function storedCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function aiPost<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; configured?: boolean }> {
  const send = (code: string) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(code ? { "x-access-code": code } : {}) },
      body: JSON.stringify(body),
    });
  try {
    let res = await send(storedCode());
    if (res.status === 401) {
      const code = window.prompt("这个网站的 AI 功能需要访问口令：") ?? "";
      if (!code) return { ok: false, error: "需要访问口令" };
      try {
        localStorage.setItem(CODE_KEY, code);
      } catch {
        /* 无法保存时下次再问 */
      }
      res = await send(code);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? `请求失败（${res.status}）`, configured: data.configured };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: `网络错误：${(e as Error).message}` };
  }
}

export type AiStatus = { configured: boolean; model: string; accessCodeRequired: boolean };

export async function aiStatus(): Promise<AiStatus | null> {
  try {
    const res = await fetch("/api/status/", { cache: "no-store" });
    return res.ok ? ((await res.json()) as AiStatus) : null;
  } catch {
    return null;
  }
}
