import Link from "next/link";
import TocLayout from "@/components/TocLayout";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getIndex } from "@/lib/content";

export const metadata = { title: "关于 · 法脉·刑法学" };

export default function AboutPage() {
  const { db } = getIndex();
  const claims = [...db.scholars, ...db.works, ...db.events, ...db.questions, ...db.prerequisites, ...db.positions, ...db.theories, ...db.relations];
  const verified = claims.filter((x) => x.status === "verified").length;
  const stats: [string, number][] = [
    ["法域", db.jurisdictions.length],
    ["专题", db.concepts.length],
    ["问题", db.questions.length],
    ["先决关系", db.prerequisites.length],
    ["根据论学说", db.theories.length],
    ["学说立场", db.positions.length],
    ["学者", db.scholars.length],
    ["文献与判例", db.works.length],
    ["演化事件", db.events.length],
    ["学者对话", db.dialogues.length],
  ];

  const layers = [
    {
      name: "知识库",
      desc: "把六个法域的刑法学说史整理成结构化数据：专题、问题、学说、立场、学者、文献、演化事件、对话与光谱。每一条都带有出处与审核状态。",
    },
    {
      name: "推理引擎",
      desc: "在问题之间建立有类型的先决关系图，自动推导学习顺序、同根问题与下游影响；按「学说 × 问题」推演结论，判断一组答案与哪些学说相容。",
    },
    {
      name: "AI 层（DeepSeek）",
      desc: "理解用户输入的案情或问题，定位争点并对应到知识库中的问题；库中没有的问题，起草标着「AI 推测」的先决树草稿，供审核后入库。",
    },
  ];

  const guards = [
    "提示词附上库内问题索引，大模型只能从中挑选问题编号；它返回的编号逐一对照知识库校验，不存在的一律丢弃。",
    "学说的结论与推演链只从知识库读取，大模型不生成任何学说立场。",
    "输出结构中不设引注字段，提示词禁止编造文献；疑似引注的文字会被检测并提示「请勿采信」。",
    "AI 起草的内容一律标记为「AI 推测·未入库」，经人工核对后才能进入知识库；校验器拦截失效引用与成环的先决关系。",
  ];

  const toc = [
    { id: "scale", label: "规模" },
    { id: "layers", label: "三层结构" },
    { id: "method", label: "方法" },
    { id: "guards", label: "防止「幻觉」的四道关" },
    { id: "start", label: "从哪里开始" },
    { id: "tech", label: "技术与声明" },
  ];

  return (
    <TocLayout items={toc}>
      <PageHeader eyebrow="关于本项目" title="法脉·刑法学：知识图谱与大模型协同的刑法学习系统">
        <p className="max-w-3xl text-ink-2">
          按学说史组织刑法知识：追到每个问题的奇点，看它在各法域如何演化、学者如何对话；把学者放上学术光谱；选定一种根据论，看它在不同问题上推出什么；提出一个问题或一段案情，看它牵动哪些先决问题与学说争点。
        </p>
      </PageHeader>

      <section id="scale" className="mb-12">
        <SectionTitle sub="由内容文件自动统计">规模</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stats.map(([label, n]) => (
            <div key={label} className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-xs text-ink-3">{label}</div>
              <div className="text-2xl font-semibold tabular-nums">{n}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-3">
          覆盖英格兰与威尔士、美国、德国、日本、台湾地区、中国大陆。已核实 {verified} / {claims.length} 条，其余为 AI 起草、待核对原文的内容。
        </p>
      </section>

      <section id="layers" className="mb-12">
        <SectionTitle sub="AI 负责理解与定位，结论来自知识库">三层结构</SectionTitle>
        <ol className="grid gap-3 md:grid-cols-3">
          {layers.map((l, i) => (
            <li key={l.name} className="card p-4">
              <div className="eyebrow">第 {i + 1} 层</div>
              <div className="mt-1 font-serif text-lg font-bold">{l.name}</div>
              <p className="mt-1 text-sm text-ink-2">{l.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="method" className="mb-12">
        <SectionTitle sub="内容如何生产与把关">方法：AI 起草，人工核对，程序校验</SectionTitle>
        <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
          {["AI 按统一结构起草", "标记「待核实」与「缺出处」", "人工核对原文并补出处", "校验器检查引用、奇点与成环", "标为「已核实」"].map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <div className="card flex-1 p-3 text-sm">
                <span className="mr-1 tabular-nums text-ink-3">{i + 1}</span>
                {s}
              </div>
              {i < 4 && (
                <span aria-hidden className="hidden text-ink-3 md:inline">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section id="guards" className="mb-12">
        <SectionTitle sub="大模型可能编造，系统的设计目标是让它无处编造">防止「幻觉」的四道关</SectionTitle>
        <ol className="space-y-2">
          {guards.map((g, i) => (
            <li key={i} className="card flex gap-3 p-3 text-sm">
              <span className="tabular-nums text-ink-3">{i + 1}</span>
              <span>{g}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="start" className="mb-12">
        <SectionTitle>从哪里开始</SectionTitle>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            ["/case/", "案例分析"],
            ["/ask/", "提问与先决问题"],
            ["/lens/", "根据论透镜"],
            ["/practice/", "练习与自测"],
            ["/spectrum/", "学术光谱"],
            ["/graph/", "概念图谱"],
            ["/review/", "审核台"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="chip hover:bg-surface-2">
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section id="tech">
        <SectionTitle>技术与声明</SectionTitle>
        <p className="text-sm text-ink-2">
          Next.js、TypeScript、Zod（数据结构校验）、Cytoscape.js 与 D3（可视化）、DeepSeek（大模型）。内容以 YAML 文件管理，每次构建前自动校验。
        </p>
        <p className="mt-2 text-sm text-ink-3">
          标有「待核实」的条目尚未经人工核对原文，引用前请以原始文献为准；光谱上的位置均为编者定位；AI 生成的文字仅供学习参考，不构成法律意见。
        </p>
      </section>
    </TocLayout>
  );
}
