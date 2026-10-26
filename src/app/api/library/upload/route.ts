import { currentUser, json, rateLimited, sameOrigin } from "@/lib/http";
import { ExtractError, extractDocument, kindOf } from "@/lib/ingest/extract";
import { addDocument, countDocuments, MAX_DOCS_PER_USER } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "请求来源不正确" }, 403);
  const u = currentUser(req);
  if (!u) return json({ error: "请先登录" }, 401);
  if (rateLimited(req, "upload", 30, 60 * 60_000)) return json({ error: "上传过于频繁，请稍后再试" }, 429);
  if (countDocuments(u.id) >= MAX_DOCS_PER_USER) return json({ error: `每位用户最多保存 ${MAX_DOCS_PER_USER} 份资料` }, 400);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "没有收到文件" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "没有收到文件" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "文件不能超过 50 MB" }, 400);
  if (!kindOf(file.name)) return json({ error: "只支持 PDF、DOCX、TXT、MD 文件" }, 400);

  try {
    const { kind, pages } = await extractDocument(Buffer.from(await file.arrayBuffer()), file.name);
    const title = (String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "")).slice(0, 120);
    const id = addDocument(u.id, title, file.name.slice(0, 200), kind, pages);
    return json({ id, title, pages: pages.length });
  } catch (e) {
    if (e instanceof ExtractError) return json({ error: e.message }, 400);
    return json({ error: "处理文件时出错" }, 500);
  }
}
