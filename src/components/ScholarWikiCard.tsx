import Image from "next/image";
import Link from "next/link";
import type { ScholarWiki } from "@/lib/schema";

const WIKI_NAME: Record<string, string> = { zh: "中文", de: "德文", ja: "日文", en: "英文" };

/** 学者页上的「基本信息」：全部来自 Wikidata，与本库自己的（待核实）记录分开显示 */
export default function ScholarWikiCard({ w }: { w: ScholarWiki }) {
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink-2">{children}</dd>
    </div>
  );
  const People = ({ list }: { list: ScholarWiki["advisors"] }) => (
    <>
      {list.map((p, i) => (
        <span key={p.qid}>
          {i > 0 && "、"}
          {p.scholar ? (
            <Link href={`/scholar/${p.scholar}/`} className="link">
              {p.label}
            </Link>
          ) : (
            p.label
          )}
        </span>
      ))}
    </>
  );
  const links = Object.entries(w.links).filter(([, v]) => v) as [string, string][];

  return (
    <section className="card mb-10 flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
      {w.image && (
        <figure className="shrink-0">
          <Image
            src={w.image.src}
            alt={w.label ?? ""}
            width={112}
            height={140}
            className="h-[140px] w-[112px] rounded-lg border border-border object-cover"
          />
          <figcaption className="mt-1 w-[112px] text-[10px] leading-tight text-ink-3">
            <a href={w.image.page} className="hover:underline" target="_blank" rel="noreferrer">
              {w.image.credit}，{w.image.license}
            </a>
          </figcaption>
        </figure>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="section-title !text-base">基本信息</h2>
          {w.description && <span className="text-sm text-ink-3">{w.description}</span>}
        </div>
        <dl className="space-y-1.5 text-sm">
          {(w.born || w.died) && (
            <Row label="生卒">
              {w.born ?? "?"} — {w.died ?? ""}
              {w.birthPlace && <span className="text-ink-3">（生于{w.birthPlace}）</span>}
            </Row>
          )}
          {w.citizenship.length > 0 && <Row label="国籍">{w.citizenship.join("、")}</Row>}
          {w.employers.length > 0 && <Row label="任职">{w.employers.join("、")}</Row>}
          {w.education.length > 0 && <Row label="就学">{w.education.join("、")}</Row>}
          {w.advisors.length > 0 && (
            <Row label="博士导师">
              <People list={w.advisors} />
            </Row>
          )}
          {w.students.length > 0 && (
            <Row label="博士生">
              <People list={w.students} />
            </Row>
          )}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          {links.length > 0 && (
            <span>
              维基百科：
              {links.map(([k, v], i) => (
                <span key={k}>
                  {i > 0 && " · "}
                  <a href={v} className="link" target="_blank" rel="noreferrer">
                    {WIKI_NAME[k] ?? k}
                  </a>
                </span>
              ))}
            </span>
          )}
          <span>
            来自{" "}
            <a href={`https://www.wikidata.org/wiki/${w.qid}`} className="link" target="_blank" rel="noreferrer">
              Wikidata（{w.qid}）
            </a>
            ，抓取于 {w.retrieved}
            {w.matchedBy === "confirmed" ? "，编者已确认是同一人" : "，按姓名与生卒年自动匹配"}
          </span>
        </div>
      </div>
    </section>
  );
}
