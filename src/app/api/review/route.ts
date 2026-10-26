import fs from "node:fs";
import path from "node:path";
import { getContent } from "@/lib/content";
import { json, readJson, sameOrigin } from "@/lib/http";
import { ReviewEditError, setStatusInYaml } from "@/lib/review-edit";
import { DB_KEYS, StatusSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 审核台按钮：把一条内容标为已核实 / 存疑 / 待核实。只在本机开发模式下可用，线上网站没有这个接口 */
export async function PATCH(req: Request) {
  if (process.env.NODE_ENV !== "development") return json({ error: "只在本地开发模式下可用" }, 404);
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const { kind, key, status } = await readJson(req);
  if (typeof kind !== "string" || !(DB_KEYS as readonly string[]).includes(kind) || typeof key !== "string") return json({ error: "参数不正确" }, 400);
  const st = StatusSchema.safeParse(status);
  if (!st.success) return json({ error: "状态不正确" }, 400);

  // 文件位置以内容加载器的记录为准，不接受前端传来的路径
  const rel = getContent().locations[key];
  if (!rel) return json({ error: "找不到这一条" }, 404);
  const root = path.join(process.cwd(), "content");
  const file = path.join(process.cwd(), rel);
  if (!file.startsWith(root + path.sep) || !file.endsWith(".yaml")) return json({ error: "文件位置不正确" }, 400);

  try {
    const text = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, setStatusInYaml(text, kind as (typeof DB_KEYS)[number], key, st.data));
    return json({ ok: true, file: rel, status: st.data });
  } catch (e) {
    if (e instanceof ReviewEditError) return json({ error: e.message }, 409);
    throw e;
  }
}
