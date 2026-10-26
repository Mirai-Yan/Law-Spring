/** 服务端：把索引整理成各可视化组件需要的可序列化数据 */
import type { LaneEvent } from "@/components/EvolutionLanes";
import type { GEdge, GNode } from "@/components/ConceptGraph";
import type { GenEdge, GenScholar, GenTheory } from "@/components/Genealogy";
import type { EntityInfo } from "@/components/SpectrumView";
import type { Index } from "./graph";
import { RELATION_LABEL, type LawEvent, type Spectrum } from "./schema";

export function toLaneEvents(ix: Index, events: LawEvent[], contextIds: Set<string> = new Set()): LaneEvent[] {
  return events.map((e) => ({
    id: e.id,
    year: e.year,
    circa: e.circa,
    jurisdiction: e.jurisdiction,
    type: e.type,
    title: e.title,
    description: e.description,
    derivedFrom: e.derivedFrom,
    originOf: e.originOf,
    originType: e.originType,
    status: e.status,
    needsSource: e.needsSource,
    context: contextIds.has(e.id),
    scholarNames: e.scholars.map((s) => ix.scholar.get(s)?.name ?? s),
    workTitles: e.works.map((w) => {
      const wk = ix.work.get(w);
      return wk ? `${wk.titleZh ?? wk.title}（${wk.year}）` : w;
    }),
  }));
}

/** 某概念的事件，外加它们直接来源中不属于该概念的事件（作为背景） */
export function conceptLaneEvents(ix: Index, conceptId: string): LaneEvent[] {
  const own = ix.eventsOfConcept.get(conceptId) ?? [];
  const ownIds = new Set(own.map((e) => e.id));
  const ctx = new Set<string>();
  for (const e of own) for (const p of e.derivedFrom) if (!ownIds.has(p)) ctx.add(p);
  const ctxEvents = [...ctx].map((id) => ix.event.get(id)!).filter(Boolean);
  return toLaneEvents(ix, [...own, ...ctxEvents], ctx);
}

/** 概念图：显式关系 + 由问题层先决关系汇总出的概念间先决边 */
export function conceptGraphData(ix: Index, focus?: string): { nodes: GNode[]; edges: GEdge[] } {
  const edges: GEdge[] = ix.db.relations.map((r) => ({
    source: r.from,
    target: r.to,
    type: r.type,
    label: RELATION_LABEL[r.type],
    description: r.description,
  }));
  const agg = new Map<string, number>();
  for (const p of ix.db.prerequisites) {
    const a = ix.question.get(p.requires)?.concept;
    const b = ix.question.get(p.question)?.concept;
    if (!a || !b || a === b) continue;
    agg.set(`${a}>${b}`, (agg.get(`${a}>${b}`) ?? 0) + 1);
  }
  for (const [k, n] of agg) {
    const [a, b] = k.split(">");
    edges.push({ source: a, target: b, type: "prereq", label: "先决", weight: n, description: `${n} 条问题层先决关系` });
  }

  let nodeIds = new Set(ix.db.concepts.map((c) => c.id));
  let es = edges;
  if (focus) {
    es = edges.filter((e) => e.source === focus || e.target === focus);
    nodeIds = new Set([focus, ...es.flatMap((e) => [e.source, e.target])]);
  }
  const nodes: GNode[] = ix.db.concepts
    .filter((c) => nodeIds.has(c.id))
    .map((c) => ({ id: c.id, label: c.name, kind: c.kind, tradition: c.tradition, area: c.area }));
  return { nodes, edges: es };
}

/** 与某概念相关的学者：事件、对话、学说代表、立场中出现的学者 */
export function conceptScholarIds(ix: Index, conceptId: string): Set<string> {
  const ids = new Set<string>();
  for (const e of ix.eventsOfConcept.get(conceptId) ?? []) e.scholars.forEach((s) => ids.add(s));
  for (const d of ix.db.dialogues) if (d.concept === conceptId) d.turns.forEach((t) => ids.add(t.scholar));
  const qids = new Set((ix.questionsOfConcept.get(conceptId) ?? []).map((q) => q.id));
  for (const t of ix.db.theories) if (qids.has(t.question)) t.proponents.forEach((s) => ids.add(s));
  for (const p of ix.db.positions) if (qids.has(p.question)) p.scholars.forEach((s) => ids.add(s));
  for (const sp of ix.db.scholarPositions) if (qids.has(sp.question)) ids.add(sp.scholar);
  return ids;
}

/** 谱系图数据：给定学者集合，补上一跳的老师、学生与影响来源，再收集其间的边 */
export function genealogyData(ix: Index, seed: Set<string>) {
  const ids = new Set(seed);
  for (const s of ix.db.scholars) {
    if (seed.has(s.id)) {
      s.teachers.forEach((t) => ids.add(t));
      s.influencedBy.forEach((t) => ids.add(t));
    }
    if (s.teachers.some((t) => seed.has(t)) || s.influencedBy.some((t) => seed.has(t))) ids.add(s.id);
  }

  const priority = (qid: string) => (qid === "q-unrecht-core" ? 0 : qid === "q-cl-basis" ? 1 : 2);
  const theories = [...ix.db.theories]
    .filter((t) => t.proponents.some((p) => ids.has(p)))
    .sort((a, b) => priority(a.question) - priority(b.question))
    .slice(0, 6);
  const genTheories: GenTheory[] = theories.map((t, i) => ({ id: t.id, name: t.name, slot: i + 1 }));

  const scholars: GenScholar[] = [...ids]
    .map((id) => ix.scholar.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({
      id: s.id,
      name: s.name,
      jurisdiction: s.jurisdiction,
      theory: theories.find((t) => t.proponents.includes(s.id))?.id,
      needsSource: s.needsSource,
    }));
  const edges: GenEdge[] = [];
  for (const s of scholars) {
    const full = ix.scholar.get(s.id)!;
    for (const t of full.teachers) if (ids.has(t)) edges.push({ from: t, to: s.id, kind: "teacher" });
    for (const t of full.influencedBy) if (ids.has(t)) edges.push({ from: t, to: s.id, kind: "influence" });
  }
  return { scholars, edges, theories: genTheories };
}

export function spectrumEntities(ix: Index, sp: Spectrum): Record<string, EntityInfo> {
  const out: Record<string, EntityInfo> = {};
  for (const p of sp.placements) {
    const [kind, id] = p.entity.split(":");
    if (kind === "scholar") {
      const s = ix.scholar.get(id);
      out[p.entity] = { label: s?.name ?? id, jurisdiction: s?.jurisdiction, href: `/scholar/${id}/`, kind: "scholar" };
    } else if (kind === "theory") {
      const t = ix.theory.get(id);
      out[p.entity] = { label: t?.name ?? id, href: `/lens/?theory=${id}`, kind: "theory" };
    } else if (kind === "jurisdiction") {
      const j = ix.jurisdiction.get(id);
      out[p.entity] = { label: `${j?.short ?? id}通说`, jurisdiction: id, href: `/jurisdiction/${id}/`, kind: "jurisdiction" };
    }
  }
  return out;
}

export function workCitation(ix: Index, workId: string): string {
  const w = ix.work.get(workId);
  if (!w) return workId;
  const authors = w.authors.map((a) => ix.scholar.get(a)?.name ?? a).join("、") || w.authorText || "";
  const title = w.titleZh && w.titleZh !== w.title ? `${w.title}（${w.titleZh}）` : w.title;
  return [authors, title, w.venue, String(w.year)].filter(Boolean).join("，");
}
