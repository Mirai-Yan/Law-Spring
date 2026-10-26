/**
 * AI 助教：学生在任何页面上随时提问。
 * 回答以当前页面的知识库内容为依据（全部是编者的概括，不含书籍原文与私有锚点）；
 * 返回的引用 id 逐一对照知识库校验，库中没有的丢弃。
 */
import { z } from "zod";
import { termLite, termsOfQuestion, termMatcher, termsIn, type TermLite } from "../glossary";
import { WIKI_RE, answerLabel, theoryAnswer, type Index } from "../graph";
import { chatJson, llmModel, type ChatTurn } from "../llm";
import { AREA_LABEL, LEVEL_LABEL } from "../schema";
import { cacheKey, readCache, writeCache } from "./cache";
import { looksLikeCitation } from "./schemas";

export type TutorPage = { kind: "question" | "concept" | "crime"; id: string };

export const MAX_TUTOR_TURNS = 12;
export const MAX_TUTOR_CHARS = 800;

/** 去掉 wiki 标记，只留显示文字 */
const plain = (s: string | undefined) => (s ?? "").replace(WIKI_RE, (_m, _k, id, label) => label ?? id).trim();

/** 当前页面在知识库中的内容，按「标题 + 条目」组织；方括号里是可引用的 id */
export function tutorContext(ix: Index, page?: TutorPage): { title: string; text: string } | null {
  if (!page) return null;
  const lines: string[] = [];
  const termIds = new Set<string>();
  const m = termMatcher(ix);
  const collect = (...texts: (string | undefined)[]) => texts.forEach((t) => termsIn(t, m).forEach((id) => termIds.add(id)));

  if (page.kind === "question") {
    const q = ix.question.get(page.id);
    if (!q) return null;
    const c = ix.concept.get(q.concept);
    lines.push(`## 问题 [${q.id}]：${q.text}`, `层级：${LEVEL_LABEL[q.level]}；所属专题 [${q.concept}]：${c?.name ?? ""}`);
    if (q.summary) lines.push(`简介：${plain(q.summary)}`);
    lines.push("### 可能的答案");
    for (const a of q.answers) lines.push(`- ${a.label}${a.summary ? `：${plain(a.summary)}` : ""}`);
    const pre = ix.prereqsOf.get(q.id) ?? [];
    if (pre.length) {
      lines.push("### 先决问题（回答本题之前要先回答的问题）");
      for (const p of pre) {
        const rq = ix.question.get(p.requires);
        lines.push(`- [${p.requires}] ${rq?.text ?? ""}；为什么先问它：${plain(p.why)}`);
        for (const b of p.branches) lines.push(`  - 若答「${answerLabel(ix, p.requires, b.answer)}」：${plain(b.leadsTo)}`);
      }
    }
    const stances = ix.db.theories.map((t) => ({ t, ta: theoryAnswer(ix, t.id, q.id) })).filter((x) => x.ta);
    if (stances.length) {
      lines.push("### 各学说的结论与推演链");
      for (const { t, ta } of stances) {
        const chain = ta!.position?.derivation.map(plain).join(" → ");
        lines.push(`- ${t.name} → ${answerLabel(ix, q.id, ta!.answer)}${chain ? `；推演：${chain}` : ""}${ta!.position?.note ? `；说明：${plain(ta!.position.note)}` : ""}`);
      }
    }
    const views = ix.bookViewsOfQuestion.get(q.id) ?? [];
    if (views.length) {
      lines.push("### 教科书论述（编者的概括）");
      for (const v of views) {
        lines.push(`- 作者结论：${v.answer ? answerLabel(ix, q.id, v.answer) : "未明确表态"}；${plain(v.summary)}`);
        v.reasons.forEach((r) => lines.push(`  - 理由：${plain(r)}`));
        v.reported.forEach((r) => lines.push(`  - 书中介绍的${r.label}：${plain(r.summary)}`));
      }
    }
    termsOfQuestion(ix, q.id, 12).forEach((id) => termIds.add(id));
    return { title: q.text, text: withTerms(lines, ix, termIds) };
  }

  if (page.kind === "concept") {
    const c = ix.concept.get(page.id);
    if (!c) return null;
    lines.push(`## 专题 [${c.id}]：${c.name}（${AREA_LABEL[c.area]}）`, `简介：${plain(c.summary)}`, "### 本专题的问题");
    for (const q of ix.questionsOfConcept.get(c.id) ?? []) lines.push(`- [${q.id}] ${q.text}（${LEVEL_LABEL[q.level]}；答案：${q.answers.map((a) => a.label).join(" / ")}）`);
    const theories = ix.db.theories.filter((t) => ix.question.get(t.question)?.concept === c.id);
    if (theories.length) {
      lines.push("### 学说");
      theories.forEach((t) => lines.push(`- ${t.name}：${plain(t.thesis)}`));
    }
    collect(c.summary, ...theories.map((t) => t.thesis));
    return { title: c.name, text: withTerms(lines, ix, termIds) };
  }

  const cr = ix.crime.get(page.id);
  if (!cr) return null;
  lines.push(`## 罪名：${cr.name}${cr.article ? `（刑法${cr.article}）` : ""}`, `所在章节：${cr.chapter}${cr.section ? ` · ${cr.section}` : ""}`);
  if (cr.legalInterest) lines.push(`保护法益：${plain(cr.legalInterest)}`);
  if (cr.elements.length) lines.push("要件要点：", ...cr.elements.map((e) => `- ${plain(e)}`));
  if (cr.related.length) lines.push("此罪与彼罪：", ...cr.related.map((r) => `- ${ix.crime.get(r.crime)?.name ?? r.crime}：${plain(r.note)}`));
  if (cr.issues.length) lines.push("主要争点：", ...cr.issues.map((q) => `- [${q}] ${ix.question.get(q)?.text ?? ""}`));
  collect(cr.legalInterest, ...cr.elements);
  return { title: cr.name, text: withTerms(lines, ix, termIds) };
}

function withTerms(lines: string[], ix: Index, ids: Set<string>): string {
  const terms = [...ids].map((id) => ix.term.get(id)).filter((t) => t != null);
  if (terms.length) {
    lines.push("### 相关基础词条");
    terms.forEach((t) => lines.push(`- [${t.id}] ${t.term}：${t.short}`));
  }
  return lines.join("\n");
}

export function tutorSystemPrompt(ctx: { title: string; text: string } | null): string {
  return `你是刑法学教学系统里的「AI 助教」。学生正在学习某个页面的内容，会就不懂的地方随时向你提问。
要求：
1. 先直接回答学生的问题，再一步步讲清理由；语言通俗，必要时举一个简短的例子。回答不超过 400 字。
2. 优先依据下面「当前页面的知识库内容」作答。知识库没有涉及的，可以用刑法学的通行知识解释，但要先说明「这一点知识库没有收录，以下是一般性的说明」。
3. 涉及学说争议时，客观说明各方观点和理由，不替学生下最终结论；不要捏造任何学者的观点。
4. 绝对不要引用、编造任何文献、书名、判例编号、页码或期刊；不要使用书名号。
5. 只输出一个 JSON 对象，不要输出任何其他文字：
{"answer": "回答正文，可以分段", "refs": ["与回答最相关的问题、专题或词条 id，只能取自下方方括号中的 id，最多 4 个"], "followups": ["学生接下来可能想问的问题，最多 3 个，每个不超过 24 字"]}

${ctx ? `# 当前页面的知识库内容\n${ctx.text}` : "# 当前页面\n学生没有附上页面内容；请按一般的刑法学知识回答，并提醒学生可以到具体的问题页提问以获得更贴近知识库的解答。"}`;
}

const RawTutorSchema = z.object({
  answer: z.string().catch(""),
  refs: z.array(z.string()).catch([]).optional(),
  followups: z.array(z.string()).catch([]).optional(),
});

export type TutorRef =
  | { kind: "question" | "concept"; id: string; label: string; href: string }
  | { kind: "term"; id: string; label: string; term: TermLite };

export type TutorResult = { answer: string; refs: TutorRef[]; followups: string[]; warnings: string[] };

export function validateTutorResult(ix: Index, raw: unknown): TutorResult {
  const parsed = RawTutorSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.answer.trim()) throw new Error("大模型返回的结构不符合要求");
  const refs: TutorRef[] = [];
  for (const id of [...new Set(parsed.data.refs ?? [])].slice(0, 6)) {
    const q = ix.question.get(id);
    const c = ix.concept.get(id);
    const t = ix.term.get(id);
    if (q) refs.push({ kind: "question", id, label: q.text, href: `/question/${id}/` });
    else if (c) refs.push({ kind: "concept", id, label: c.name, href: `/concept/${id}/` });
    else if (t) refs.push({ kind: "term", id, label: t.term, term: termLite(ix, t) });
  }
  const answer = parsed.data.answer.trim().slice(0, 1500);
  const followups = (parsed.data.followups ?? []).map((f) => f.trim().slice(0, 40)).filter(Boolean).slice(0, 3);
  const warnings = looksLikeCitation(answer) ? ["回答中疑似出现文献或页码引注，请勿采信，以原始文献为准。"] : [];
  return { answer, refs: refs.slice(0, 4), followups, warnings };
}

export function parseTutorPage(v: unknown): TutorPage | undefined {
  const p = v as { kind?: unknown; id?: unknown } | null;
  if (!p || typeof p.id !== "string" || !["question", "concept", "crime"].includes(p.kind as string)) return undefined;
  return { kind: p.kind as TutorPage["kind"], id: p.id };
}

export async function askTutorAI(
  ix: Index,
  messages: ChatTurn[],
  page?: TutorPage,
): Promise<{ source: "ai" | "cache"; model: string; result: TutorResult; context?: string }> {
  const ctx = tutorContext(ix, page);
  const last = messages[messages.length - 1];
  const key = cacheKey("tutor", llmModel(), page ? `${page.kind}:${page.id}` : "-", JSON.stringify(messages));
  const cached = readCache(key);
  if (cached) return { source: "cache", model: llmModel(), result: validateTutorResult(ix, cached), context: ctx?.title };
  const raw = await chatJson({
    system: tutorSystemPrompt(ctx),
    history: messages.slice(0, -1),
    user: last.content,
    maxTokens: 1200,
  });
  const result = validateTutorResult(ix, raw);
  writeCache(key, raw);
  return { source: "ai", model: llmModel(), result, context: ctx?.title };
}
