import yaml from "js-yaml";
import { entityKey } from "./load";
import { ContentFileSchema, DB_KEYS, type Status } from "./schema";

/**
 * 审核台的「核对通过 / 存疑」：在 YAML 原文里只改（或补上）这一条的 status 一行，
 * 其余文字、注释、排版一概不动；改完整份文件重新解析校验，不通过就不写入。
 */

type Kind = (typeof DB_KEYS)[number];

export class ReviewEditError extends Error {}

export function setStatusInYaml(text: string, kind: Kind, key: string, status: Status): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === `${kind}:` || l.startsWith(`${kind}: `));
  if (start < 0) throw new ReviewEditError(`文件里没有 ${kind} 段`);
  let end = lines.findIndex((l, i) => i > start && /^\S/.test(l) && !l.startsWith("#"));
  if (end < 0) end = lines.length;

  // 这一段里每个列表项的起止行
  const itemIndent = lines.slice(start + 1, end).find((l) => /^\s*- /.test(l))?.match(/^(\s*)- /)?.[1] ?? "  ";
  const starts: number[] = [];
  for (let i = start + 1; i < end; i++) if (lines[i].startsWith(`${itemIndent}- `)) starts.push(i);

  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    let e = k + 1 < starts.length ? starts[k + 1] : end;
    while (e > s + 1 && /^\s*(#.*)?$/.test(lines[e - 1])) e--; // 去掉条目后面的空行和注释
    const block = lines.slice(s, e);
    let item: unknown;
    try {
      item = (yaml.load(block.join("\n")) as unknown[])[0];
    } catch {
      continue;
    }
    if (entityKey(kind, item) !== key) continue;

    const field = `${itemIndent}  `;
    const statusLine = block.findIndex((l, i) => (i === 0 ? l.startsWith(`${itemIndent}- status:`) : l.startsWith(`${field}status:`)));
    const out = [...lines];
    if (statusLine >= 0) {
      const prefix = statusLine === 0 ? `${itemIndent}- ` : field;
      out[s + statusLine] = `${prefix}status: ${status}`;
    } else out.splice(e, 0, `${field}status: ${status}`);
    const next = out.join("\n");
    check(next, kind, key, status);
    return next;
  }
  throw new ReviewEditError(`文件里找不到条目 ${key}`);
}

function check(text: string, kind: Kind, key: string, status: Status) {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (e) {
    throw new ReviewEditError(`改动后 YAML 无法解析：${(e as Error).message}`);
  }
  const parsed = ContentFileSchema.safeParse(doc);
  if (!parsed.success) throw new ReviewEditError("改动后不符合内容格式");
  const list = (parsed.data[kind] ?? []) as unknown[];
  const hit = list.find((it) => entityKey(kind, it) === key) as { status?: string } | undefined;
  if (hit?.status !== status) throw new ReviewEditError("改动没有落到这一条上");
}
