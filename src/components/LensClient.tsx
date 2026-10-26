"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import type { Bundle } from "@/lib/bundle";
import { answerLabel, lensRows, theoryAnswer, type Index } from "@/lib/graph";
import { AREA_LABEL, AREA_ORDER, type Area, type Theory } from "@/lib/schema";
import { useBundleIndex } from "./QuestionWorkbench";
import { InlineRich } from "./RichText";
import { LevelBadge, StatusBadge } from "./ui";

type Mode = "single" | "compare" | "matrix";

export default function LensClient({ bundle }: { bundle: Bundle }) {
  const ix = useBundleIndex(bundle);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const theories = ix.db.theories;
  const mode = (params.get("mode") as Mode) ?? "single";
  const a = params.get("theory") ?? "result-disvalue";
  const b = params.get("vs") ?? (a === "dual-act-disvalue" ? "result-disvalue" : "dual-act-disvalue");

  const set = (patch: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) sp.set(k, v);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1" role="group" aria-label="透镜模式">
        {(
          [
            ["single", "单一学说"],
            ["compare", "两说对照"],
            ["matrix", "学说 × 问题矩阵"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} className="btn" aria-pressed={mode === m} onClick={() => set({ mode: m })}>
            {label}
          </button>
        ))}
      </div>

      {mode !== "matrix" && (
        <div className="flex flex-wrap items-center gap-3">
          <TheorySelect ix={ix} theories={theories} value={a} onChange={(v) => set({ theory: v })} label={mode === "compare" ? "学说 A" : "选定根据论"} />
          {mode === "compare" && (
            <TheorySelect ix={ix} theories={theories} value={b} onChange={(v) => set({ vs: v })} label="学说 B" />
          )}
        </div>
      )}

      {mode === "single" && <Single ix={ix} theoryId={a} />}
      {mode === "compare" && <Compare ix={ix} a={a} b={b} />}
      {mode === "matrix" && <Matrix ix={ix} />}
    </div>
  );
}

function TheorySelect({
  ix,
  theories,
  value,
  onChange,
  label,
}: {
  ix: Index;
  theories: Theory[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const groups = new Map<string, Theory[]>();
  for (const t of theories) {
    const g = groups.get(t.question) ?? [];
    g.push(t);
    groups.set(t.question, g);
  }
  return (
    <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
      <span className="shrink-0 text-ink-2">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-1.5"
      >
        {[...groups].map(([qid, ts]) => (
          <optgroup key={qid} label={ix.question.get(qid)?.text}>
            {ts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function Derivation({ ix, steps }: { ix: Index; steps: string[] }) {
  if (!steps.length) return null;
  return (
    <ol className="mt-1.5 flex flex-wrap items-center gap-1 text-sm text-ink-2">
      {steps.map((d, i) => (
        <li key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="text-ink-3">→</span>}
          <InlineRich text={d} ix={ix} />
        </li>
      ))}
    </ol>
  );
}

/* ---------------- 单一学说 ---------------- */

function Single({ ix, theoryId }: { ix: Index; theoryId: string }) {
  const t = ix.theory.get(theoryId);
  const rows = useMemo(() => lensRows(ix, theoryId), [ix, theoryId]);
  if (!t) return null;
  const noStance = rows.filter((r) => r.answer === null).length;
  const alts = rows.filter((r) => r.position?.alternatives.length).length;
  const devs = rows.flatMap((r) => r.deviations);
  const byConcept = new Map<string, typeof rows>();
  for (const r of rows) {
    const g = byConcept.get(r.question.concept) ?? [];
    g.push(r);
    byConcept.set(r.question.concept, g);
  }

  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-xl font-bold">{t.name}</h2>
          {t.original.de && <span className="text-sm text-ink-3">{t.original.de}</span>}
          {t.original.ja && <span className="text-sm text-ink-3">{t.original.ja}</span>}
          <StatusBadge item={t} />
        </div>
        <p className="mt-1 text-sm text-ink-3">
          回答的根据论问题：
          <Link href={`/question/${t.question}/`} className="link">
            {ix.question.get(t.question)?.text}
          </Link>
          {" "}→「{answerLabel(ix, t.question, t.answer)}」
        </p>
        <p className="prose-cn mt-2">
          <InlineRich text={t.thesis} ix={ix} />
        </p>
        {t.proponents.length > 0 && (
          <p className="mt-2 text-sm text-ink-2">
            代表学者：
            {t.proponents.map((s, i) => (
              <Fragment key={s}>
                {i > 0 && "、"}
                <Link href={`/scholar/${s}/`} className="link">
                  {ix.scholar.get(s)?.name}
                </Link>
              </Fragment>
            ))}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="有立场的问题" value={rows.length} />
          <Stat label="无统一立场" value={noStance} />
          <Stat label="阵营内另说" value={alts} />
          <Stat label="偏离阵营的学者" value={devs.length} />
        </div>
      </div>

      {[...byConcept].map(([cid, list]) => (
        <section key={cid}>
          <h3 className="mb-2 flex items-baseline gap-2">
            <Link href={`/concept/${cid}/`} className="section-title hover:underline">
              {ix.concept.get(cid)?.name}
            </Link>
          </h3>
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.question.id} className="card p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <LevelBadge level={r.question.level} />
                  <Link href={`/question/${r.question.id}/`} className="font-serif font-semibold hover:underline">
                    {r.question.text}
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span aria-hidden className="text-ink-3">⇒</span>
                  <span className={`font-medium ${r.answer ? "text-accent-ink" : "text-ink-3"}`}>
                    {answerLabel(ix, r.question.id, r.answer)}
                  </span>
                  {r.own && <span className="chip">学说本身的主张</span>}
                  {r.position && <StatusBadge item={r.position} compact />}
                </div>
                {r.position && <Derivation ix={ix} steps={r.position.derivation} />}
                {r.position?.note && (
                  <p className="mt-1 text-sm text-ink-3">
                    <InlineRich text={r.position.note} ix={ix} />
                  </p>
                )}
                {r.position?.alternatives.map((alt, i) => (
                  <p key={i} className="mt-1 text-sm text-ink-3">
                    <span aria-hidden>＊</span>阵营内另说「{answerLabel(ix, r.question.id, alt.answer)}」
                    {alt.jurisdictions.length > 0 && `（${alt.jurisdictions.map((j) => ix.jurisdiction.get(j)?.short).join("、")}）`}：
                    <InlineRich text={alt.note} ix={ix} />
                  </p>
                ))}
                {r.deviations.map((d) => (
                  <p key={d.scholar} className="mt-1 text-sm">
                    <span aria-hidden>⚑ </span>
                    <Link href={`/scholar/${d.scholar}/`} className="link">
                      {ix.scholar.get(d.scholar)?.name}
                    </Link>
                    偏离阵营，主张「{answerLabel(ix, r.question.id, d.answer)}」
                    {d.note && <span className="text-ink-3">：{d.note}</span>}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/* ---------------- 两说对照 ---------------- */

function Compare({ ix, a, b }: { ix: Index; a: string; b: string }) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const ta = ix.theory.get(a);
  const tb = ix.theory.get(b);
  if (!ta || !tb) return null;
  const rows = ix.db.questions
    .map((q) => ({ q, A: theoryAnswer(ix, a, q.id), B: theoryAnswer(ix, b, q.id) }))
    .filter((r) => r.A || r.B);
  const diff = (r: (typeof rows)[number]) => !!r.A?.answer && !!r.B?.answer && r.A.answer !== r.B.answer;
  const shown = onlyDiff ? rows.filter(diff) : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          只看结论不同的问题
        </label>
        <span className="text-ink-3">
          共 {rows.length} 个问题，结论不同 {rows.filter(diff).length} 个
        </span>
      </div>
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.q.id} className="card p-3 sm:p-4" style={diff(r) ? { borderColor: "var(--accent)" } : undefined}>
            <div className="flex flex-wrap items-center gap-2">
              {diff(r) && <span className="chip" style={{ color: "var(--accent-ink)", borderColor: "var(--accent)" }}>结论不同</span>}
              <Link href={`/question/${r.q.id}/`} className="font-serif font-semibold hover:underline">
                {r.q.text}
              </Link>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  [ta, r.A],
                  [tb, r.B],
                ] as const
              ).map(([t, x], i) => (
                <div key={i} className="rounded-md bg-surface-2 p-2.5">
                  <div className="text-xs text-ink-3">{t.name}</div>
                  <div className={`font-medium ${x?.answer ? "" : "text-ink-3"}`}>
                    {x ? answerLabel(ix, r.q.id, x.answer) : "未收录"}
                  </div>
                  {x?.position && <Derivation ix={ix} steps={x.position.derivation} />}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- 矩阵 ---------------- */

function Matrix({ ix }: { ix: Index }) {
  // 列：回答同一个根据论问题的各个学说；行：按体系位置筛选的问题
  const foundationQs = [...new Set(ix.db.theories.map((t) => t.question))];
  const [fq, setFq] = useState(foundationQs.includes("q-unrecht-core") ? "q-unrecht-core" : foundationQs[0]);
  const [area, setArea] = useState<Area | "all">("all");
  const [onlySplit, setOnlySplit] = useState(false);
  const [detail, setDetail] = useState<{ t: string; q: string } | null>(null);
  const theories = ix.db.theories.filter((t) => t.question === fq);
  const conceptArea = (qid: string) => ix.concept.get(ix.question.get(qid)?.concept ?? "")?.area;
  const splitOf = (qid: string) =>
    new Set(theories.map((t) => theoryAnswer(ix, t.id, qid)?.answer).filter(Boolean)).size > 1;
  const questions = ix.db.questions
    .filter((q) => theories.some((t) => theoryAnswer(ix, t.id, q.id)))
    .filter((q) => area === "all" || conceptArea(q.id) === area)
    .filter((q) => !onlySplit || splitOf(q.id))
    .sort((a, b) => AREA_ORDER.indexOf(conceptArea(a.id)!) - AREA_ORDER.indexOf(conceptArea(b.id)!));
  const areasPresent = AREA_ORDER.filter((a) =>
    ix.db.questions.some((q) => conceptArea(q.id) === a && theories.some((t) => theoryAnswer(ix, t.id, q.id))),
  );
  const det = detail ? theoryAnswer(ix, detail.t, detail.q) : undefined;
  const sel = "min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
          <span className="shrink-0 text-ink-2">根据论</span>
          <select className={sel} value={fq} onChange={(e) => { setFq(e.target.value); setDetail(null); }}>
            {foundationQs.map((q) => (
              <option key={q} value={q}>
                {ix.question.get(q)?.text}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
          <span className="shrink-0 text-ink-2">体系位置</span>
          <select className={sel} value={area} onChange={(e) => setArea(e.target.value as Area | "all")}>
            <option value="all">全部</option>
            {areasPresent.map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={onlySplit} onChange={(e) => setOnlySplit(e.target.checked)} />
          只看学说间有分歧的问题
        </label>
        <span className="text-sm text-ink-3">{questions.length} 个问题</span>
      </div>
      <p className="text-sm text-ink-3">点任一格查看推演链。＊ 表示阵营内另有有力说，⚑ 表示有学者偏离阵营。</p>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 bg-surface px-3 py-2 font-normal text-ink-3">问题</th>
              {theories.map((t) => (
                <th key={t.id} className="px-3 py-2 font-semibold">
                  <Link href={`/lens/?theory=${t.id}`} className="hover:underline">
                    {t.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => {
              const split = splitOf(q.id);
              return (
                <tr key={q.id} className="border-b border-border align-top last:border-0">
                  <th className="sticky left-0 max-w-[260px] bg-surface px-3 py-2 font-normal">
                    <Link href={`/question/${q.id}/`} className="font-serif hover:underline">
                      {q.text}
                    </Link>
                    {split && <div className="mt-0.5 text-xs text-accent-ink">学说间有分歧</div>}
                  </th>
                  {theories.map((t) => {
                    const ta = theoryAnswer(ix, t.id, q.id);
                    const dev = ix.db.scholarPositions.some((sp) => sp.deviatesFrom === t.id && sp.question === q.id);
                    const active = detail?.t === t.id && detail?.q === q.id;
                    return (
                      <td key={t.id} className="px-1 py-1">
                        {ta ? (
                          <button
                            onClick={() => setDetail(active ? null : { t: t.id, q: q.id })}
                            className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-2 ${active ? "bg-surface-2 ring-1 ring-ink-3" : ""} ${ta.own ? "font-semibold" : ""} ${ta.answer ? "" : "text-ink-3"}`}
                          >
                            {answerLabel(ix, q.id, ta.answer)}
                            {ta.position?.alternatives.length ? <span className="text-ink-3"> ＊</span> : null}
                            {dev && <span> ⚑</span>}
                          </button>
                        ) : (
                          <span className="block px-2 py-1.5 text-ink-3">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {detail && det && (
        <div className="card p-4" aria-live="polite">
          <div className="text-sm text-ink-3">
            {ix.theory.get(detail.t)?.name} · {ix.question.get(detail.q)?.text}
          </div>
          <div className="mt-1 font-medium text-accent-ink">{answerLabel(ix, detail.q, det.answer)}</div>
          {det.position && <Derivation ix={ix} steps={det.position.derivation} />}
          {det.position?.note && <p className="mt-1 text-sm text-ink-3"><InlineRich text={det.position.note} ix={ix} /></p>}
          {det.position?.alternatives.map((alt, i) => (
            <p key={i} className="mt-1 text-sm text-ink-3">
              ＊阵营内另说「{answerLabel(ix, detail.q, alt.answer)}」：<InlineRich text={alt.note} ix={ix} />
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
