import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { json } from "@/lib/ai/guard";
import { ContentFileSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

/** 把 AI 草稿存入 content/_inbox/（只在本地开发时可用；加载器会跳过 _inbox，审核后再手动移入正式目录） */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") return json({ error: "只在本地开发模式下可用" }, 404);
  const body = (await req.json().catch(() => ({}))) as { yaml?: unknown };
  if (typeof body.yaml !== "string" || body.yaml.length > 20_000) return json({ error: "内容无效" }, 400);
  let doc: unknown;
  try {
    doc = yaml.load(body.yaml);
  } catch {
    return json({ error: "YAML 解析失败" }, 400);
  }
  const parsed = ContentFileSchema.safeParse(doc);
  if (!parsed.success) return json({ error: "YAML 不符合内容格式" }, 400);
  const dir = path.join(process.cwd(), "content", "_inbox");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ai-${new Date().toISOString().replace(/[:.]/g, "-")}.yaml`);
  fs.writeFileSync(file, body.yaml);
  return json({ saved: path.relative(process.cwd(), file) });
}
