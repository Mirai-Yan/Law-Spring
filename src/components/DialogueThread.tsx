import Link from "next/link";
import type { Index } from "@/lib/graph";
import type { Dialogue } from "@/lib/schema";
import { workCitation } from "@/lib/view";
import { InlineRich, RichText } from "./RichText";
import { JurDot, StatusBadge } from "./ui";

/** 学者对话：按回合展示，缩进表示「回应了哪一回合」 */
export default function DialogueThread({ d, ix }: { d: Dialogue; ix: Index }) {
  const byId = new Map(d.turns.map((t) => [t.id, t]));
  const depth = (id: string, seen = new Set<string>()): number => {
    const t = byId.get(id);
    if (!t?.respondsTo || seen.has(id)) return 0;
    seen.add(id);
    return 1 + depth(t.respondsTo, seen);
  };

  return (
    <article id={d.id} className="card p-4 sm:p-5">
      <header className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-lg font-bold">{d.title}</h3>
          <StatusBadge item={d} />
        </div>
        {d.summary && <RichText text={d.summary} ix={ix} className="mt-1 text-sm text-ink-2" />}
      </header>
      <ol className="space-y-3">
        {d.turns.map((t, i) => {
          const s = ix.scholar.get(t.scholar);
          const lvl = Math.min(depth(t.id), 3);
          const replyTo = t.respondsTo ? byId.get(t.respondsTo) : undefined;
          return (
            <li key={t.id} style={{ marginLeft: lvl * 20 }} className={lvl ? "border-l-2 border-border pl-3" : ""}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span className="tabular-nums text-ink-3">{i + 1}</span>
                {s && <JurDot id={s.jurisdiction} />}
                <Link href={`/scholar/${t.scholar}/`} className="font-semibold hover:underline">
                  {s?.name ?? t.scholar}
                </Link>
                {t.year && <span className="text-ink-3">{t.year}</span>}
                {replyTo && (
                  <span className="text-xs text-ink-3">
                    ↩ 回应 {ix.scholar.get(replyTo.scholar)?.name}（第 {d.turns.indexOf(replyTo) + 1} 回合）
                  </span>
                )}
              </div>
              <p className="prose-cn mt-1">
                <InlineRich text={t.claim} ix={ix} />
              </p>
              {t.work && <p className="mt-0.5 text-xs text-ink-3">出处：{workCitation(ix, t.work)}</p>}
            </li>
          );
        })}
      </ol>
    </article>
  );
}
