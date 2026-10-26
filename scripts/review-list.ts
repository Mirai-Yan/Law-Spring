/**
 * npm run review:list
 * 列出所有待核实（draft / needsSource / disputed）的条目，按文件分组。
 * 可选参数：实体类型，如 npm run review:list -- scholars
 */
import path from "node:path";
import { entityKey, loadContent } from "../src/lib/load";
import { DB_KEYS } from "../src/lib/schema";

const only = process.argv[2];
const { db, locations } = loadContent(path.resolve("content"));
const byFile = new Map<string, string[]>();
let total = 0;

for (const kind of DB_KEYS) {
  if (only && kind !== only) continue;
  for (const item of db[kind] as Record<string, unknown>[]) {
    const items: Record<string, unknown>[] =
      kind === "spectra" ? (item.placements as Record<string, unknown>[]) : [item];
    for (const it of items) {
      const flags: string[] = [];
      if (it.status === "draft") flags.push("draft");
      if (it.status === "disputed") flags.push("disputed");
      if (it.needsSource) flags.push("needsSource");
      if (!flags.length) continue;
      const key = kind === "spectra" ? `${entityKey(kind, item)} / ${it.entity}` : entityKey(kind, it);
      const file = locations[entityKey(kind, item)] ?? "?";
      const list = byFile.get(file) ?? [];
      list.push(`  [${flags.join(",")}] ${key}`);
      byFile.set(file, list);
      total++;
    }
  }
}

for (const [file, list] of [...byFile].sort()) {
  console.log(file);
  for (const l of list) console.log(l);
}
console.log(`\n共 ${total} 条待核实`);
