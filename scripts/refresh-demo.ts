/**
 * npm run demo:refresh
 * 用真实的 DeepSeek 输出替换 content/_demo/cases.json 中的预置演示结果（需要 .env.local 中的 DEEPSEEK_API_KEY）。
 * 替换后请人工检查每个争点对应的问题是否合理，再用于路演。
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeCase, loadDemoCases } from "../src/lib/ai/analyze";
import { buildIndex } from "../src/lib/graph";
import { llmConfigured, llmModel } from "../src/lib/llm";
import { loadContent } from "../src/lib/load";

async function main() {
  if (!llmConfigured()) {
    console.error("未配置 DEEPSEEK_API_KEY：请先在 .env.local 中填入 key。");
    process.exit(1);
  }
  const ix = buildIndex(loadContent(path.resolve("content")).db);
  const file = path.resolve("content/_demo/cases.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  // 口语化示例只用来演示「确认案情」，没有分析结果
  const demos = loadDemoCases().filter((d) => !d.sample);
  for (const d of demos) {
    process.stdout.write(`分析「${d.title}」… `);
    const t0 = Date.now();
    const { result } = await analyzeCase(ix, d.text, { refresh: true });
    const target = data.cases.find((c: { id: string }) => c.id === d.id);
    target.result = { summary: result.summary, issues: result.issues.map(({ title, facts, note, questionIds }) => ({ title, facts, note, questionIds })) };
    target.preset = false;
    target.generatedBy = `${llmModel()} · ${new Date().toISOString().slice(0, 10)}`;
    console.log(`${result.issues.length} 个争点，${((Date.now() - t0) / 1000).toFixed(1)} 秒${result.warnings.length ? `；⚠ ${result.warnings.join(" ")}` : ""}`);
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`已写入 ${path.relative(process.cwd(), file)}，请人工检查后再用于路演。`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
