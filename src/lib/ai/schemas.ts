/**
 * 大模型输出的校验与「接地」：
 * 先用宽松的 Zod 结构解析，再逐项对照知识库——不存在的问题 id 一律丢弃并记录，
 * AI 生成的问题与先决关系一律标记为 origin: ai、status: draft。
 */
import { createHash } from "node:crypto";
import yaml from "js-yaml";
import { z } from "zod";
import type { Index } from "../graph";
import { validateDb, type Finding } from "../validate";
import {
  ContentFileSchema,
  PrereqKindSchema,
  type Db,
  type Prerequisite,
  type Question,
} from "../schema";

const str = (max: number) =>
  z
    .string()
    .catch("")
    .transform((s) => s.trim().slice(0, max));

/* ------------------------------------------------------------------ */
/*  案例分析                                                            */
/* ------------------------------------------------------------------ */

const RawCaseSchema = z.object({
  summary: str(300).optional(),
  issues: z
    .array(
      z.object({
        title: str(60),
        facts: str(200).optional(),
        questionIds: z.array(z.string()).catch([]).optional(),
        note: str(160).optional(),
      }),
    )
    .catch([]),
});

export type CaseIssue = {
  title: string;
  facts: string;
  note: string;
  questionIds: string[];
  /** 大模型给出、但库中不存在的 id */
  droppedIds: string[];
};

export type CaseResult = { summary: string; issues: CaseIssue[]; warnings: string[] };

/** 疑似引注：书名号、期刊期号、判例编号、页码 */
const CITATION_RE = /《[^》]{1,40}》|第\s*\d+\s*期|\d{4}\s*年第\s*\d+\s*期|[刑民]?[初终]字第|\bp\.\s*\d+|第\s*\d+\s*页/;

export function looksLikeCitation(text: string): boolean {
  return CITATION_RE.test(text);
}

export function validateCaseResult(ix: Index, raw: unknown): CaseResult {
  const parsed = RawCaseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("大模型返回的结构不符合要求");
  const warnings: string[] = [];
  const issues: CaseIssue[] = [];
  for (const it of parsed.data.issues.slice(0, 6)) {
    if (!it.title) continue;
    const ids = [...new Set(it.questionIds ?? [])];
    const kept = ids.filter((id) => ix.question.has(id)).slice(0, 3);
    const dropped = ids.filter((id) => !ix.question.has(id));
    if (dropped.length) warnings.push(`争点「${it.title}」中有 ${dropped.length} 个问题 id 在库中不存在，已丢弃。`);
    const issue: CaseIssue = {
      title: it.title,
      facts: it.facts ?? "",
      note: it.note ?? "",
      questionIds: kept,
      droppedIds: dropped,
    };
    if ([issue.title, issue.facts, issue.note].some(looksLikeCitation))
      warnings.push(`争点「${it.title}」的 AI 文字中疑似出现引注，请勿采信。`);
    issues.push(issue);
  }
  return { summary: parsed.data.summary ?? "", issues, warnings };
}

/* ------------------------------------------------------------------ */
/*  案情整理（分析前与用户确认案情）                                      */
/* ------------------------------------------------------------------ */

const RawBriefSchema = z.object({
  restated: str(600),
  facts: z
    .array(z.object({ text: str(160), source: z.string().catch("原文").optional() }))
    .catch([]),
  questions: z
    .array(
      z.object({
        ask: str(100),
        why: str(80).optional(),
        options: z.array(z.string()).catch([]),
        multi: z.boolean().catch(false).optional(),
      }),
    )
    .catch([])
    .optional(),
  ready: z.boolean().catch(false).optional(),
});

export type BriefFact = { id: string; text: string; source: "原文" | "补充" };
export type BriefQuestion = { id: string; ask: string; why: string; options: string[]; multi: boolean };
export type CaseBrief = { restated: string; facts: BriefFact[]; questions: BriefQuestion[]; ready: boolean; warnings: string[] };

export function validateCaseBrief(raw: unknown): CaseBrief {
  const parsed = RawBriefSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.restated) throw new Error("大模型返回的结构不符合要求");
  const facts: BriefFact[] = parsed.data.facts
    .filter((f) => f.text)
    .slice(0, 12)
    .map((f, i) => ({ id: `f${i + 1}`, text: f.text, source: f.source === "补充" ? "补充" : "原文" }));
  const questions: BriefQuestion[] = (parsed.data.questions ?? [])
    .map((q) => ({ ...q, options: [...new Set(q.options.map((o) => o.trim().slice(0, 40)).filter(Boolean))].slice(0, 4) }))
    .filter((q) => q.ask && q.options.length >= 2)
    .slice(0, 3)
    .map((q, i) => ({ id: `q${i + 1}`, ask: q.ask, why: q.why ?? "", options: q.options, multi: !!q.multi }));
  const warnings: string[] = [];
  if ([parsed.data.restated, ...facts.map((f) => f.text), ...questions.flatMap((q) => [q.ask, q.why, ...q.options])].some(looksLikeCitation))
    warnings.push("整理结果中疑似出现引注，请勿采信。");
  // 没有问题时才算整理完毕，避免模型说 ready 却还在提问
  return { restated: parsed.data.restated, facts, questions, ready: questions.length === 0 && (parsed.data.ready ?? true), warnings };
}

/** 确认后的案情：交给争点分析的输入 */
export function confirmedCaseText(c: { restated: string; facts: { text: string }[] }): string {
  return `以下案情已与用户逐条确认：\n${c.restated.trim()}\n\n事实要点：\n${c.facts.map((f, i) => `${i + 1}. ${f.text.trim()}`).join("\n")}`;
}

/* ------------------------------------------------------------------ */
/*  自由提问                                                            */
/* ------------------------------------------------------------------ */

const RawAskSchema = z.object({
  matches: z.array(z.string()).catch([]).optional(),
  draft: z
    .object({
      text: str(120),
      level: z.enum(["applied", "intermediate"]).catch("applied").optional(),
      answers: z
        .array(z.object({ id: str(40), label: str(60) }))
        .catch([])
        .optional(),
      prerequisites: z
        .array(
          z.object({
            requires: z.string().catch(""),
            kind: z.string().catch("logical").optional(),
            why: str(160).optional(),
            branches: z
              .array(z.object({ answer: z.string().catch(""), leadsTo: str(160) }))
              .catch([])
              .optional(),
          }),
        )
        .catch([])
        .optional(),
    })
    .nullable()
    .catch(null)
    .optional(),
});

export type AskDraft = {
  question: Question;
  prerequisites: Prerequisite[];
  /** 大模型给出、但库中不存在的先决问题 id */
  droppedRequires: string[];
  /** 合并进知识库后，校验器针对草稿报告的问题 */
  findings: Finding[];
  yaml: string;
};

export type AskResult = { matches: string[]; droppedIds: string[]; draft: AskDraft | null; warnings: string[] };

const slug = (s: string, i: number) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `a${i + 1}`;

export function validateAskResult(ix: Index, raw: unknown, query: string): AskResult {
  const parsed = RawAskSchema.safeParse(raw);
  if (!parsed.success) throw new Error("大模型返回的结构不符合要求");
  const warnings: string[] = [];
  const ids = [...new Set(parsed.data.matches ?? [])];
  const matches = ids.filter((id) => ix.question.has(id)).slice(0, 5);
  const droppedIds = ids.filter((id) => !ix.question.has(id));
  if (droppedIds.length) warnings.push(`有 ${droppedIds.length} 个问题 id 在库中不存在，已丢弃。`);

  let draft: AskDraft | null = null;
  const d = parsed.data.draft;
  if (d && d.text) {
    // 答案
    const answers: Question["answers"] = [];
    for (const [i, a] of (d.answers ?? []).entries()) {
      if (!a.label) continue;
      let id = slug(a.id, i);
      while (answers.some((x) => x.id === id)) id = `${id}-${i + 1}`;
      answers.push({ id, label: a.label });
    }
    // 先决关系：只保留指向库内问题的边，分支答案必须属于先决问题
    const droppedRequires: string[] = [];
    const seen = new Set<string>();
    const qid = `ai-${createHash("sha256").update(d.text).digest("hex").slice(0, 8)}`;
    const prerequisites: Prerequisite[] = [];
    for (const p of d.prerequisites ?? []) {
      const req = ix.question.get(p.requires);
      if (!req) {
        if (p.requires) droppedRequires.push(p.requires);
        continue;
      }
      if (seen.has(req.id)) continue;
      seen.add(req.id);
      const kind = PrereqKindSchema.safeParse(p.kind).success ? (p.kind as Prerequisite["kind"]) : "logical";
      const branches = (p.branches ?? []).filter(
        (b) => b.leadsTo && req.answers.some((a) => a.id === b.answer),
      );
      prerequisites.push({
        question: qid,
        requires: req.id,
        kind,
        why: p.why || "（AI 未说明理由）",
        branches,
        status: "draft",
        sources: [],
        origin: "ai",
      });
    }
    if (droppedRequires.length)
      warnings.push(`草稿中有 ${droppedRequires.length} 个先决问题在库中不存在，已丢弃。`);

    const concept =
      ix.question.get(prerequisites[0]?.requires ?? "")?.concept ?? ix.question.get(matches[0] ?? "")?.concept;
    if (answers.length >= 1 && concept) {
      const question: Question = {
        id: qid,
        concept,
        text: d.text,
        aliases: [query.slice(0, 60)],
        level: d.level ?? "applied",
        domain: "criminal",
        answers,
        status: "draft",
        sources: [],
        origin: "ai",
      };
      const findings = validateDb(mergeDraft(ix.db, question, prerequisites)).filter((f) => f.where.includes(qid));
      draft = { question, prerequisites, droppedRequires, findings, yaml: draftToYaml(question, prerequisites) };
      if ([d.text, ...answers.map((a) => a.label), ...prerequisites.flatMap((p) => [p.why, ...p.branches.map((b) => b.leadsTo)])].some(looksLikeCitation))
        warnings.push("草稿的 AI 文字中疑似出现引注，请勿采信。");
    } else if (d.text) {
      warnings.push("AI 起草的问题缺少可用的答案或无法挂到任何库内问题上，已放弃草稿。");
    }
  }
  return { matches, droppedIds, draft, warnings };
}

export function mergeDraft(db: Db, question: Question, prerequisites: Prerequisite[]): Db {
  return { ...db, questions: [...db.questions, question], prerequisites: [...db.prerequisites, ...prerequisites] };
}

export function draftToYaml(question: Question, prerequisites: Prerequisite[]): string {
  const body = yaml.dump(
    { questions: [question], prerequisites },
    { lineWidth: 120, noRefs: true, quotingType: '"' },
  );
  // 保证导出的 YAML 能被内容加载器接受
  ContentFileSchema.parse(yaml.load(body));
  return `# AI 推测·未入库：请核对后移入 content/ 正式目录，并补全 why、branches 与出处\n${body}`;
}
