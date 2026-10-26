import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** AI 原始返回的本地缓存：相同输入不重复调用大模型，也让演示在断网时可以回放 */
const DIR = path.join(process.cwd(), ".cache", "ai");

export function cacheKey(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

export function readCache(key: string): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${key}.json`), "utf8"));
  } catch {
    return undefined;
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${key}.json`), JSON.stringify(value, null, 2));
  } catch {
    /* 缓存失败不影响主流程 */
  }
}
