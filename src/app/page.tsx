import Link from "next/link";
import { EXAMPLES } from "@/lib/examples";
import { JurDot, SectionTitle } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { AREA_LABEL, AREA_ORDER } from "@/lib/schema";
import { IconSparkle, IconStar } from "@/components/icons";

export default function Home() {
  const ix = getIndex();
  const { db } = ix;
  const jurs = [...db.jurisdictions].sort((a, b) => a.order - b.order);
  const all = [...db.scholars, ...db.works, ...db.events, ...db.questions, ...db.prerequisites, ...db.positions];
  const verified = all.filter((x) => x.status === "verified").length;

  return (
    <div className="space-y-14">
      {/* 提问 */}
      <section className="pt-6 sm:pt-12">
        <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
          任何一个刑法问题，
          <br className="sm:hidden" />
          都有它的先决问题。
        </h1>
        <p className="mt-3 max-w-2xl text-ink-2">
          按学说史组织的刑法学习工具：追到奇点，看演化、对话与谱系；把学者放上光谱；选定一种根据论，看它在不同问题上如何展开。
        </p>
        <form action="/ask/" method="get" className="mt-6 flex max-w-2xl gap-2">
          <label htmlFor="home-q" className="sr-only">
            输入一个刑法问题
          </label>
          <input
            id="home-q"
            name="q"
            placeholder="输入一个刑法问题，例如：偶然防卫怎么处理"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-3 font-serif text-base outline-none focus:border-ink-3"
          />
          <button type="submit" className="btn btn-primary !px-5">
            提问
          </button>
        </form>
        <div className="mt-3 flex max-w-2xl flex-wrap gap-2">
          {EXAMPLES.slice(0, 5).map((e) => (
            <Link key={e} href={`/ask/?q=${encodeURIComponent(e)}`} className="chip hover:bg-surface-2">
              {e}
            </Link>
          ))}
        </div>
      </section>

      {/* 法系地图 */}
      <section>
        <SectionTitle sub="点进任一法域，看它的学说演变与继受来源">法系地图</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {(["common", "civil"] as const).map((tr) => (
            <div key={tr}>
              <div className="eyebrow mb-2">{tr === "common" ? "英美法系" : "大陆法系"}</div>
              <div className="grid gap-2">
                {jurs
                  .filter((j) => j.tradition === tr)
                  .map((j) => {
                    const ev = db.events.filter((e) => e.jurisdiction === j.id).length;
                    const sc = db.scholars.filter((s) => s.jurisdiction === j.id).length;
                    return (
                      <Link key={j.id} href={`/jurisdiction/${j.id}/`} className="card block p-3 hover:bg-surface-2">
                        <div className="flex items-center gap-2">
                          <JurDot id={j.id} size={10} />
                          <span className="font-serif font-semibold">{j.name}</span>
                          <span className="ml-auto text-xs text-ink-3">
                            {sc} 位学者 · {ev} 个事件
                          </span>
                        </div>
                        {j.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{j.summary}</p>}
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 专题 */}
      <section>
        <SectionTitle sub="按犯罪论体系排列；带星标的是根据论，数字是该专题下的问题数">专题</SectionTitle>
        <div className="space-y-5">
          {AREA_ORDER.filter((a) => db.concepts.some((c) => c.area === a)).map((a) => (
            <div key={a} className="grid gap-x-6 gap-y-2 md:grid-cols-[180px_1fr]">
              <div className="eyebrow pt-1.5">{AREA_LABEL[a]}</div>
              <div className="flex flex-wrap gap-2">
                {db.concepts
                  .filter((c) => c.area === a)
                  .sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "foundation" ? -1 : 1))
                  .map((c) => (
                    <Link
                      key={c.id}
                      href={`/concept/${c.id}/`}
                      className="card inline-flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-surface-2"
                      style={c.kind === "foundation" ? { borderColor: "var(--accent)" } : undefined}
                    >
                      {c.kind === "foundation" && <span className="text-accent-ink"><IconStar size={13} filled /><span className="sr-only">根据论</span></span>}
                      <span className="font-serif">{c.name}</span>
                      <span className="text-xs text-ink-3">{ix.questionsOfConcept.get(c.id)?.length ?? 0}</span>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 入口 */}
      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/case/" className="card block p-4 hover:bg-surface-2" style={{ borderColor: "var(--accent)" }}>
          <div className="flex items-center gap-2 font-serif text-lg font-bold"><IconSparkle size={18} />案例分析</div>
          <p className="mt-1 text-sm text-ink-2">输入一段案情，AI 找出争点并对应到知识库；各学说的结论与推演链来自经过审核的知识库。</p>
        </Link>
        <Link href="/practice/" className="card block p-4 hover:bg-surface-2">
          <div className="font-serif text-lg font-bold">练习与自测</div>
          <p className="mt-1 text-sm text-ink-2">由知识库自动出题：按学说推结论、按结论找学说、识别先决问题。</p>
        </Link>
        <Link href="/about/" className="card block p-4 hover:bg-surface-2">
          <div className="font-serif text-lg font-bold">关于本项目</div>
          <p className="mt-1 text-sm text-ink-2">三层结构、内容把关流程，以及防止大模型编造的设计。</p>
        </Link>
        <Link href="/lens/" className="card block p-4 hover:bg-surface-2">
          <div className="font-serif text-lg font-bold">根据论透镜</div>
          <p className="mt-1 text-sm text-ink-2">选定一种根据论（行为无价值与结果无价值、新旧学派、报应与预防、责任论），看它在各个问题上推出什么。</p>
        </Link>
        <Link href="/spectrum/" className="card block p-4 hover:bg-surface-2">
          <div className="font-serif text-lg font-bold">学术光谱</div>
          <p className="mt-1 text-sm text-ink-2">把学者放到「结果无价值 ↔ 行为无价值」的轴上，拖动年份看立场如何漂移。</p>
        </Link>
        <Link href="/review/" className="card block p-4 hover:bg-surface-2">
          <div className="font-serif text-lg font-bold">审核进度</div>
          <p className="mt-1 text-sm text-ink-2">
            已核实 <span className="font-semibold tabular-nums">{verified}</span> / {all.length} 条。其余为 AI 起草、待核对原文。
          </p>
        </Link>
      </section>
    </div>
  );
}
