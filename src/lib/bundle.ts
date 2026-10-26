import { emptyDb, type Db } from "./schema";
import type { Index } from "./graph";

/**
 * 交给客户端组件的数据子集（可序列化）。
 * 客户端用 buildIndex(bundleToDb(bundle)) 重建索引，再调用 graph.ts 里的纯函数。
 */
export type Bundle = Pick<
  Db,
  "questions" | "prerequisites" | "theories" | "positions" | "scholarPositions" | "concepts" | "relations" | "terms"
> & {
  scholars: Pick<Db["scholars"][number], "id" | "name" | "jurisdiction">[];
  jurisdictions: Db["jurisdictions"];
};

export function makeBundle(ix: Index): Bundle {
  const { db } = ix;
  return {
    questions: db.questions,
    prerequisites: db.prerequisites,
    theories: db.theories,
    positions: db.positions,
    scholarPositions: db.scholarPositions,
    concepts: db.concepts,
    relations: db.relations,
    terms: db.terms,
    jurisdictions: db.jurisdictions,
    scholars: db.scholars.map((s) => ({ id: s.id, name: s.name, jurisdiction: s.jurisdiction })),
  };
}

export function bundleToDb(b: Bundle): Db {
  return {
    ...emptyDb(),
    questions: b.questions,
    prerequisites: b.prerequisites,
    theories: b.theories,
    positions: b.positions,
    scholarPositions: b.scholarPositions,
    concepts: b.concepts,
    relations: b.relations,
    terms: b.terms,
    jurisdictions: b.jurisdictions,
    scholars: b.scholars as Db["scholars"],
  };
}
