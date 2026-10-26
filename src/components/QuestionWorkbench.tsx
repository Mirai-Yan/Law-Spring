"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  answerLabel,
  applyTheory,
  ancestors,
  buildIndex,
  compatibility,
  conceptLinks,
  downstream,
  learningOrder,
  prereqTree,
  sameRootQuestions,
  theoryAnswer,
  type Index,
  type PrereqTreeNode,
} from "@/lib/graph";
import { bundleToDb, type Bundle } from "@/lib/bundle";
import { RELATION_LABEL } from "@/lib/schema";
import { InlineRich } from "./RichText";
import RootTree from "./RootTree";
import { KindChip, LevelBadge, StatusBadge } from "./ui";
import { IconStar } from "./icons";

export function useBundleIndex(bundle: Bundle): Index {
  return useMemo(() => buildIndex(bundleToDb(bundle)), [bundle]);
}

type Mode = "tree" | "walk";
type Shape = "roots" | "list";

export default function QuestionWorkbench({
  bundle,
  questionId,
  showHeader = false,
  hooksId,
}: {
  bundle: Bundle;
  questionId: string;
  showHeader?: boolean;
  /** 页内目录要定位「学习顺序与挂钩」时给的锚点 */
  hooksId?: string;
}) {
  const ix = useBundleIndex(bundle);
  const q = ix.question.get(questionId);
  const [mode, setMode] = useState<Mode>("tree");
  const [shape, setShape] = useState<Shape>("roots");
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<string | null>(null);

  const tree = useMemo(() => prereqTree(ix, questionId), [ix, questionId]);
  const treeQids = useMemo(() => [questionId, ...ancestors(ix, questionId)], [ix, questionId]);

  if (!q) return null;

  const toggle = (qid: string, ans: string) => {
    setApplied(null);
    setSelection((s) => {
      const next = { ...s };
      if (next[qid] === ans) delete next[qid];
      else next[qid] = ans;
      return next;
    });
  };
  const apply = (tid: string) => {
    setMode("walk");
    setApplied(tid);
    setSelection(applyTheory(ix, tid, treeQids));
  };

  const theoriesInTree = ix.db.theories.filter((t) =>
    treeQids.some((qid) => theoryAnswer(ix, t.id, qid)?.answer),
  );

  return (
    <div className="space-y-8">
      {showHeader && (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <LevelBadge level={q.level} />
            <Link href={`/concept/${q.concept}/`} className="chip hover:bg-surface-2">
              专题：{ix.concept.get(q.concept)?.name}
            </Link>
            <StatusBadge item={q} />
          </div>
          <h2 className="font-serif text-xl font-bold">
            <Link href={`/question/${q.id}/`} className="hover:underline">
              {q.text}
            </Link>
          </h2>
          {q.summary && <p className="prose-cn mt-1 text-ink-2">{q.summary}</p>}
        </div>
      )}

      {/* ---------- 先决问题树 / 分岔推演 ---------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="section-title">先决问题</h3>
            <p className="text-sm text-ink-3">
              要回答这个问题，得先解决下面这些问题；顺着根往下，一直追到最深处的根据论（带星标）。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1" role="group" aria-label="呈现方式">
              <button className="btn" aria-pressed={shape === "roots"} onClick={() => setShape("roots")}>
                根系图
              </button>
              <button className="btn" aria-pressed={shape === "list"} onClick={() => setShape("list")}>
                列表
              </button>
            </div>
            <div className="flex gap-1" role="group" aria-label="模式">
              <button className="btn" aria-pressed={mode === "tree"} onClick={() => setMode("tree")}>
                浏览
              </button>
              <button className="btn" aria-pressed={mode === "walk"} onClick={() => setMode("walk")}>
                分岔推演
              </button>
            </div>
          </div>
        </div>

        {mode === "walk" && (
          <WalkPanel
            ix={ix}
            rootId={questionId}
            selection={selection}
            applied={applied}
            theories={theoriesInTree.map((t) => t.id)}
            onApply={apply}
            onClear={() => {
              setSelection({});
              setApplied(null);
            }}
          />
        )}

        {shape === "roots" ? (
          <RootTree ix={ix} rootId={questionId} tree={tree} walk={mode === "walk"} selection={selection} onToggle={toggle} />
        ) : (
          <div className="card p-3 sm:p-4">
            <ul>
              <TreeNode
                node={tree}
                ix={ix}
                depth={0}
                walk={mode === "walk"}
                selection={selection}
                onToggle={toggle}
              />
            </ul>
          </div>
        )}
      </section>

      <div id={hooksId} data-toc-target={hooksId ? "" : undefined} className="grid gap-8 md:grid-cols-2">
        <LearningPath ix={ix} questionId={questionId} />
        <Hooks ix={ix} questionId={questionId} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TreeNode({
  node,
  ix,
  depth,
  walk,
  selection,
  onToggle,
}: {
  node: PrereqTreeNode;
  ix: Index;
  depth: number;
  walk: boolean;
  selection: Record<string, string>;
  onToggle: (qid: string, ans: string) => void;
}) {
  const q = ix.question.get(node.question);
  // 默认全部展开：DAG 中重复出现的节点会以「已在上方展开」指回首次出现的位置，那里必须可见
  const [open, setOpen] = useState(true);
  if (!q) return null;
  const edge = node.edge;
  const chosen = selection[node.question];
  const branch = edge && chosen ? edge.branches.find((b) => b.answer === chosen) : undefined;
  const isRoot = depth === 0;

  return (
    <li className={isRoot ? "" : "relative border-l border-border pl-3 sm:pl-5"}>
      {edge && (
        <div className="pt-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <KindChip kind={edge.kind} />
            <span className="text-ink-2">
              <InlineRich text={edge.why} ix={ix} />
            </span>
          </div>
          {walk && branch && (
            <div className="mt-1.5 rounded-md px-2.5 py-1.5" style={{ background: "var(--accent-soft)" }}>
              <span className="text-accent-ink">
                取「{answerLabel(ix, node.question, chosen)}」 →{" "}
              </span>
              <InlineRich text={branch.leadsTo} ix={ix} />
            </div>
          )}
          {!walk && edge.branches.length > 0 && (
            <details className="mt-1 text-ink-2">
              <summary className="cursor-pointer select-none text-xs text-ink-3 hover:text-ink">
                答案不同，下游怎么走（{edge.branches.length} 种）
              </summary>
              <ul className="mt-1 space-y-1 pl-1">
                {edge.branches.map((b) => (
                  <li key={b.answer}>
                    <span className="font-medium text-ink">「{answerLabel(ix, node.question, b.answer)}」</span>
                    ：<InlineRich text={b.leadsTo} ix={ix} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div
        id={node.repeated ? undefined : `node-${q.id}`}
        className={`mt-2 rounded-lg px-3 py-2 ${q.level === "foundation" ? "" : "bg-surface-2"}`}
        style={q.level === "foundation" ? { background: "var(--accent-soft)" } : undefined}
      >
        <div className="flex items-start gap-2">
          {node.children.length > 0 && !node.repeated ? (
            <button
              onClick={() => setOpen((o) => !o)}
              className="mt-0.5 w-5 shrink-0 text-ink-3 hover:text-ink"
              aria-expanded={open}
              aria-label={open ? "收起先决问题" : "展开先决问题"}
            >
              {open ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {q.level === "foundation" && <LevelBadge level="foundation" />}
              <Link
                href={`/question/${q.id}/`}
                className={`font-serif ${isRoot ? "text-lg font-bold" : "font-semibold"} hover:underline`}
              >
                {q.text}
              </Link>
              <span className="text-xs text-ink-3">{ix.concept.get(q.concept)?.name}</span>
            </div>
            {node.repeated && (
              <a href={`#node-${q.id}`} className="text-xs text-ink-3 hover:text-ink">
                ↑ 已在上方展开
              </a>
            )}
            {walk && (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${q.text} 的答案`}>
                {q.answers.map((a) => (
                  <button
                    key={a.id}
                    className="btn !px-2.5 !py-0.5 !text-[13px]"
                    aria-pressed={chosen === a.id}
                    title={a.summary}
                    onClick={() => onToggle(q.id, a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {open && !node.repeated && node.children.length > 0 && (
        <ul className="ml-1 sm:ml-3">
          {node.children.map((c) => (
            <TreeNode
              key={`${c.question}-${c.edge?.question}`}
              node={c}
              ix={ix}
              depth={depth + 1}
              walk={walk}
              selection={selection}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */

function WalkPanel({
  ix,
  rootId,
  selection,
  applied,
  theories,
  onApply,
  onClear,
}: {
  ix: Index;
  rootId: string;
  selection: Record<string, string>;
  applied: string | null;
  theories: string[];
  onApply: (tid: string) => void;
  onClear: () => void;
}) {
  const comp = compatibility(ix, selection);
  const consistent = comp.filter((c) => c.conflicts.length === 0);
  const appliedPos = applied ? theoryAnswer(ix, applied, rootId) : undefined;
  const picked = Object.keys(selection).length;

  return (
    <div className="card mb-3 space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-2">套用根据论：</span>
        {theories.map((tid) => (
          <button key={tid} className="btn !py-0.5 !text-[13px]" aria-pressed={applied === tid} onClick={() => onApply(tid)}>
            {ix.theory.get(tid)?.name}
          </button>
        ))}
        {picked > 0 && (
          <button className="btn !py-0.5 !text-[13px]" onClick={onClear}>
            清空
          </button>
        )}
      </div>

      {applied && (
        <div className="rounded-md border border-border p-3 text-sm">
          <div className="mb-1 font-medium">
            {ix.theory.get(applied)?.name} 对本题的结论：
            <span className="text-accent-ink">{appliedPos ? answerLabel(ix, rootId, appliedPos.answer) : "（未收录立场）"}</span>
          </div>
          {appliedPos?.position?.derivation.length ? (
            <ol className="flex flex-wrap items-center gap-1 text-ink-2">
              {appliedPos.position.derivation.map((d, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden className="text-ink-3">→</span>}
                  <span>
                    <InlineRich text={d} ix={ix} />
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          {appliedPos?.position?.alternatives.map((a, i) => (
            <p key={i} className="mt-1 text-ink-3">
              阵营内另说「{answerLabel(ix, rootId, a.answer)}」：<InlineRich text={a.note} ix={ix} />
            </p>
          ))}
          {appliedPos?.position?.note && (
            <p className="mt-1 text-ink-3">
              <InlineRich text={appliedPos.position.note} ix={ix} />
            </p>
          )}
        </div>
      )}

      {picked > 0 ? (
        <div className="text-sm">
          <div className="mb-1 text-ink-2">
            已选 {picked} 个答案。各学说与这组答案的对照：
            {consistent.length === 0 && <span className="text-ink-3">（没有完全相容的学说，你的组合与已收录的立场都有冲突）</span>}
          </div>
          <ul className="space-y-1">
            {comp.slice(0, 6).map((c) => {
              const ta = theoryAnswer(ix, c.theory.id, rootId);
              return (
                <li key={c.theory.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{c.theory.name}</span>
                  <span className="text-xs text-ink-3">
                    一致 {c.matched.length}
                    {c.conflicts.length > 0 && ` · 冲突 ${c.conflicts.length}`}
                    {c.unknown.length > 0 && ` · 未收录 ${c.unknown.length}`}
                  </span>
                  {ta?.answer && (
                    <span className="text-ink-2">
                      → 本题：<span className="text-accent-ink">{answerLabel(ix, rootId, ta.answer)}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ink-3">在下面任一问题上选一个答案，或直接套用一种根据论，看结论如何沿先决链传导。</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LearningPath({ ix, questionId }: { ix: Index; questionId: string }) {
  const order = learningOrder(ix, questionId);
  return (
    <section>
      <h3 className="section-title">学习顺序</h3>
      <p className="mb-3 text-sm text-ink-3">从根据论读到这个问题，每一步都排在它的先决问题之后。</p>
      <ol className="space-y-1.5">
        {order.map((qid, i) => {
          const q = ix.question.get(qid)!;
          return (
            <li key={qid} className="flex gap-3 text-sm">
              <span className="w-6 shrink-0 text-right tabular-nums text-ink-3">{i + 1}</span>
              <span className="min-w-0">
                <Link href={`/question/${qid}/`} className={`hover:underline ${qid === questionId ? "font-bold" : ""}`}>
                  {q.text}
                </Link>
                {q.level === "foundation" && <span className="ml-1 text-accent-ink"><IconStar size={12} filled /><span className="sr-only">根据论</span></span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Hooks({ ix, questionId }: { ix: Index; questionId: string }) {
  const q = ix.question.get(questionId)!;
  const down = downstream(ix, questionId);
  const same = sameRootQuestions(ix, questionId);
  const links = conceptLinks(ix, q.concept);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  return (
    <section className="space-y-5">
      <div>
        <h3 className="section-title">挂钩</h3>
        <p className="text-sm text-ink-3">这个问题的答案会牵动哪些问题，又和哪些问题同根、对称。</p>
      </div>

      <div>
        <h4 className="mb-1.5 text-sm font-semibold">下游影响</h4>
        {down.direct.length === 0 ? (
          <p className="text-sm text-ink-3">没有问题以它为先决。</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {down.direct.map((p) => (
              <li key={p.question} className="flex flex-wrap items-center gap-2">
                <KindChip kind={p.kind} />
                <Link href={`/question/${p.question}/`} className="hover:underline">
                  {ix.question.get(p.question)?.text}
                </Link>
              </li>
            ))}
            {down.indirect.length > 0 && (
              <li className="pt-1 text-ink-3">另经由它们间接影响 {down.indirect.length} 个问题。</li>
            )}
          </ul>
        )}
      </div>

      {links.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">对称与功能对应</h4>
          <ul className="space-y-3 text-sm">
            {links.map((l) => (
              <li key={`${l.relation.type}-${l.other.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip">{RELATION_LABEL[l.relation.type]}</span>
                  <Link href={`/concept/${l.other.id}/`} className="font-medium hover:underline">
                    {l.other.name}
                  </Link>
                </div>
                {l.relation.description && (
                  <p className="mt-1 text-ink-2">
                    <InlineRich text={l.relation.description} ix={ix} />
                  </p>
                )}
                {l.questions.filter((x) => x.level === "applied").length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-ink-2">
                    {l.questions
                      .filter((x) => x.level === "applied")
                      .map((x) => (
                        <li key={x.id}>
                          <Link href={`/question/${x.id}/`} className="link">
                            {x.text}
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="mb-1.5 text-sm font-semibold">同根问题</h4>
        {same.length === 0 ? (
          <p className="text-sm text-ink-3">没有找到共享同一根据论的其他问题。</p>
        ) : (
          <div className="space-y-3 text-sm">
            {[...same]
              .sort((a, b) => a.questions.length - b.questions.length)
              .map((g) => {
                const all = showAll[g.root];
                const list = all ? g.questions : g.questions.slice(0, 5);
                return (
                  <div key={g.root}>
                    <div className="text-ink-3">
                      同以 <Link href={`/question/${g.root}/`} className="link">{ix.question.get(g.root)?.text}</Link> 为根据论：
                    </div>
                    <ul className="mt-1 list-disc pl-5">
                      {list.map((qid) => (
                        <li key={qid}>
                          <Link href={`/question/${qid}/`} className="hover:underline">
                            {ix.question.get(qid)?.text}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {g.questions.length > 5 && (
                      <button
                        className="mt-1 text-xs text-ink-3 hover:text-ink"
                        onClick={() => setShowAll((s) => ({ ...s, [g.root]: !all }))}
                      >
                        {all ? "收起" : `展开全部 ${g.questions.length} 个`}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </section>
  );
}
