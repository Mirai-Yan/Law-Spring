import ReportLink from "@/components/ReportLink";
import Link from "next/link";
import { answerLabel, type Index } from "@/lib/graph";
import type { BookView } from "@/lib/schema";
import { workCitation } from "@/lib/view";
import { InlineRich, type TermScope } from "./RichText";
import { SectionTitle, StatusBadge } from "./ui";

/** 问题页上的「教科书中的论述」：作者的结论与理由、书中转述的各说，全部标注页码 */
export default function BookViews({ ix, views, terms }: { ix: Index; views: BookView[]; terms?: TermScope }) {
  if (views.length === 0) return null;
  return (
    <section id="book" className="mb-10">
      <SectionTitle sub="编者对教科书论述的概括，标注印刷页码；引用请以原书为准">教科书中的论述</SectionTitle>
      <div className="space-y-4">
        {views.map((v) => (
          <article key={v.id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <span>{workCitation(ix, v.work)}</span>
              <span className="tabular-nums">· 第 {v.pages} 页</span>
              <StatusBadge item={v} compact />
              <ReportLink target={`bookViews:${v.id}`} />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="text-sm text-ink-3">作者的结论</span>
              <span className="font-serif text-lg font-bold text-accent-ink">{v.answer ? answerLabel(ix, v.question, v.answer) : "未明确表态"}</span>
            </div>
            <p className="prose-cn mt-1 text-ink-2">
              <InlineRich text={v.summary} ix={ix} terms={terms} />
            </p>
            {v.reasons.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
                {v.reasons.map((r, i) => (
                  <li key={i}>
                    <InlineRich text={r} ix={ix} terms={terms} />
                  </li>
                ))}
              </ol>
            )}
            {v.reported.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="mb-1.5 text-xs text-ink-3">书中介绍的观点（据该书转述，不是原始出处）</div>
                <ul className="space-y-1.5 text-sm">
                  {v.reported.map((r, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{r.label}</span>
                      {r.answer && <span className="text-accent-ink">→ {answerLabel(ix, v.question, r.answer)}</span>}
                      {r.theory && (
                        <Link href={`/lens/?theory=${r.theory}`} className="text-xs text-ink-3 hover:text-ink">
                          （{ix.theory.get(r.theory)?.name}）
                        </Link>
                      )}
                      <span className="text-ink-2">
                        <InlineRich text={r.summary} ix={ix} />
                      </span>
                      <span className="text-xs tabular-nums text-ink-3">p. {r.pages}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {v.editorNote && <p className="mt-3 text-xs text-ink-3">编者注：{v.editorNote}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
