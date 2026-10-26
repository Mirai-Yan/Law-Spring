import Fuse from "fuse.js";
import type { Concept, Question } from "./schema";

export type SearchHit = { question: Question; score: number; via?: string };

/** 低于这个分数视为「库里有这个问题」；越小越匹配 */
export const MATCH_THRESHOLD = 0.35;

type Doc = { id: string; text: string; aliases: string[]; concept: string; original: string };

const norm = (s: string) => s.replace(/[\s？?。，,、「」『』（）()：:；;！!·]/g, "").toLowerCase();

export function makeSearcher(questions: Question[], concepts: Concept[]) {
  const conceptOf = new Map(concepts.map((c) => [c.id, c]));
  const docs: Doc[] = questions.map((q) => {
    const c = conceptOf.get(q.concept);
    return {
      id: q.id,
      text: q.text,
      aliases: q.aliases,
      concept: c?.name ?? "",
      original: [c?.original.de, c?.original.ja, c?.original.en].filter(Boolean).join(" "),
    };
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const fuse = new Fuse(docs, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.6,
    keys: [
      { name: "text", weight: 2 },
      { name: "aliases", weight: 2 },
      { name: "concept", weight: 1 },
      { name: "original", weight: 0.7 },
    ],
  });

  return function search(query: string, limit = 8): SearchHit[] {
    const nq = norm(query);
    if (!nq) return [];
    const scores = new Map<string, { score: number; via?: string }>();
    const put = (id: string, score: number, via?: string) => {
      const prev = scores.get(id);
      if (!prev || score < prev.score) scores.set(id, { score, via });
    };

    // 子串包含：问法 ⊂ 提问，或提问 ⊂ 问法。中文检索里这比模糊匹配可靠得多。
    // 专题名的匹配略逊于问题本身的问法，使输入专题名时优先命中该专题的核心问题
    for (const d of docs) {
      const cands: [string, number][] = [[d.text, 0], ...d.aliases.map((a) => [a, 0] as [string, number]), [d.concept, 0.08]];
      for (const [cand, penalty] of cands) {
        const nc = norm(cand);
        if (nc.length < 2) continue;
        if (nq.includes(nc)) put(d.id, 0.05 + penalty + 0.3 * (1 - nc.length / nq.length), cand);
        else if (nc.includes(nq)) put(d.id, 0.05 + penalty + 0.3 * (1 - nq.length / nc.length), cand);
      }
    }
    // 模糊匹配对中文并不可靠：只有近乎完全一致时才算命中，否则只作为「最接近的问题」
    for (const r of fuse.search(query)) {
      const fs = r.score ?? 1;
      put(r.item.id, fs < 0.05 ? 0.2 : MATCH_THRESHOLD + 0.01 + fs * 0.5);
    }

    const levelBias = { applied: 0, intermediate: 0.01, foundation: 0.02 } as const;
    return [...scores.entries()]
      .map(([id, s]) => ({ question: byId.get(id)!, score: s.score + levelBias[byId.get(id)!.level], via: s.via }))
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  };
}
