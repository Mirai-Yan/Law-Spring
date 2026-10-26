import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  共用字段                                                           */
/* ------------------------------------------------------------------ */

export const StatusSchema = z.enum(["draft", "verified", "disputed"]);
export type Status = z.infer<typeof StatusSchema>;

export const SourceSchema = z.object({
  work: z.string(),
  pages: z.string().optional(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

/** 所有带学术主张的实体都带这组字段 */
const claim = {
  status: StatusSchema.default("draft"),
  sources: z.array(SourceSchema).default([]),
  needsSource: z.boolean().optional(),
  editorNote: z.string().optional(),
  /** AI（第二版 Gemini）生成、尚未入库的条目 */
  origin: z.enum(["human", "ai"]).optional(),
};

export const DomainSchema = z.enum(["criminal", "civil", "administrative"]);
export type Domain = z.infer<typeof DomainSchema>;

const OriginalTermsSchema = z
  .object({
    de: z.string().optional(),
    ja: z.string().optional(),
    en: z.string().optional(),
  })
  .default({});

/* ------------------------------------------------------------------ */
/*  实体                                                               */
/* ------------------------------------------------------------------ */

export const TraditionSchema = z.enum(["common", "civil"]);
export type Tradition = z.infer<typeof TraditionSchema>;

export const JurisdictionSchema = z.object({
  id: z.string(),
  name: z.string(),
  short: z.string(),
  tradition: TraditionSchema,
  order: z.number(),
  summary: z.string().optional(),
});
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

export const ScholarSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameOriginal: z.string().optional(),
  jurisdiction: z.string(),
  born: z.number().optional(),
  died: z.number().optional(),
  affiliations: z.array(z.string()).default([]),
  /** 师承：老师的 scholar id */
  teachers: z.array(z.string()).default([]),
  /** 思想影响：受谁影响 */
  influencedBy: z.array(z.string()).default([]),
  bio: z.string().optional(),
  ...claim,
});
export type Scholar = z.infer<typeof ScholarSchema>;

/* ---------------- 学者的外部资料（Wikidata） ---------------- */

const WikiPersonSchema = z.object({
  qid: z.string().regex(/^Q\d+$/),
  label: z.string(),
  /** 若此人也在本库学者中，给出其 id */
  scholar: z.string().optional(),
});

/**
 * 由 scripts/enrich-scholars.ts 从 Wikidata 抓取的基本信息，单独存放，不改动学者条目本身。
 * Wikidata 的数据以 CC0 发布；维基百科正文不复制，只给链接。
 */
export const ScholarWikiSchema = z
  .object({
    scholar: z.string(),
    qid: z.string().regex(/^Q\d+$/),
    /** auto：脚本自动确定；confirmed：编者在待审核清单中确认 */
    matchedBy: z.enum(["auto", "confirmed"]),
    retrieved: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    /** YYYY-MM-DD、YYYY-MM 或 YYYY */
    born: z.string().optional(),
    died: z.string().optional(),
    birthPlace: z.string().optional(),
    citizenship: z.array(z.string()).default([]),
    employers: z.array(z.string()).default([]),
    education: z.array(z.string()).default([]),
    advisors: z.array(WikiPersonSchema).default([]),
    students: z.array(WikiPersonSchema).default([]),
    links: z
      .object({ zh: z.string(), de: z.string(), ja: z.string(), en: z.string() })
      .partial()
      .default({}),
    image: z
      .object({
        /** 下载到 public/ 下的本地路径，网站运行时不访问外网 */
        src: z.string(),
        page: z.string(),
        license: z.string(),
        credit: z.string(),
      })
      .optional(),
  })
  .strict();
export type ScholarWiki = z.infer<typeof ScholarWikiSchema>;

export const WorkTypeSchema = z.enum([
  "monograph",
  "article",
  "textbook",
  "case",
  "statute",
  "report",
  "lecture",
]);

export const WorkSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleZh: z.string().optional(),
  authors: z.array(z.string()).default([]),
  /** 作者不在学者库中时（法院、立法机关、编者等） */
  authorText: z.string().optional(),
  year: z.number(),
  type: WorkTypeSchema,
  jurisdiction: z.string(),
  venue: z.string().optional(),
  ...claim,
});
export type Work = z.infer<typeof WorkSchema>;

export const ConceptKindSchema = z.enum(["foundation", "problem"]);

/** 专题在体系中的位置，用于分组浏览 */
export const AreaSchema = z.enum([
  "foundations",
  "system",
  "tatbestand",
  "mens",
  "unrecht",
  "schuld",
  "stages",
  "participation",
  "sanctions",
  "special",
  "sp-public",
  "sp-economy",
  "sp-person",
  "sp-property",
  "sp-order",
  "sp-duty",
]);
export type Area = z.infer<typeof AreaSchema>;

export const ConceptSchema = z.object({
  id: z.string(),
  name: z.string(),
  original: OriginalTermsSchema,
  kind: ConceptKindSchema,
  area: AreaSchema,
  domain: DomainSchema.default("criminal"),
  tradition: z.enum(["common", "civil", "both"]).default("civil"),
  summary: z.string().optional(),
  /** 学说史的起点尚未考证（多见于据教科书新增的分论专题）；校验时只提示、不报错，绝不为过校验编造奇点 */
  originPending: z.boolean().optional(),
  ...claim,
});
export type Concept = z.infer<typeof ConceptSchema>;

export const AnswerSchema = z.object({
  id: z.string(),
  label: z.string(),
  summary: z.string().optional(),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const QuestionLevelSchema = z.enum([
  "foundation",
  "intermediate",
  "applied",
]);
export type QuestionLevel = z.infer<typeof QuestionLevelSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  concept: z.string(),
  text: z.string(),
  /** 常见问法，供检索 */
  aliases: z.array(z.string()).default([]),
  level: QuestionLevelSchema,
  domain: DomainSchema.default("criminal"),
  summary: z.string().optional(),
  answers: z.array(AnswerSchema).min(1),
  ...claim,
});
export type Question = z.infer<typeof QuestionSchema>;

export const PrereqKindSchema = z.enum([
  "foundational",
  "logical",
  "systematic",
  "conceptual",
]);
export type PrereqKind = z.infer<typeof PrereqKindSchema>;

export const BranchSchema = z.object({
  /** 先决问题（requires）的某个答案 id */
  answer: z.string(),
  /** 取这个答案时，下游问题会走向哪里 */
  leadsTo: z.string(),
});

export const PrerequisiteSchema = z.object({
  /** 下游问题 */
  question: z.string(),
  /** 先决问题 */
  requires: z.string(),
  kind: PrereqKindSchema,
  why: z.string(),
  branches: z.array(BranchSchema).default([]),
  ...claim,
});
export type Prerequisite = z.infer<typeof PrerequisiteSchema>;

export const TheorySchema = z.object({
  id: z.string(),
  name: z.string(),
  original: OriginalTermsSchema,
  /** 这个学说所回答的根据论问题 */
  question: z.string(),
  /** 它在该问题上给出的答案 id */
  answer: z.string(),
  thesis: z.string(),
  proponents: z.array(z.string()).default([]),
  jurisdictions: z.array(z.string()).default([]),
  domain: DomainSchema.default("criminal"),
  ...claim,
});
export type Theory = z.infer<typeof TheorySchema>;

export const PositionSchema = z.object({
  theory: z.string(),
  question: z.string(),
  /** null 表示该学说对此没有统一立场 */
  answer: z.string().nullable(),
  /** 从学说前提到结论的推演步骤 */
  derivation: z.array(z.string()).default([]),
  scholars: z.array(z.string()).default([]),
  /** 阵营内部的其他有力见解 */
  alternatives: z
    .array(
      z.object({
        answer: z.string(),
        note: z.string(),
        jurisdictions: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  note: z.string().optional(),
  ...claim,
});
export type Position = z.infer<typeof PositionSchema>;

export const ScholarPositionSchema = z.object({
  scholar: z.string(),
  question: z.string(),
  answer: z.string(),
  deviatesFrom: z.string(),
  note: z.string().optional(),
  ...claim,
});
export type ScholarPosition = z.infer<typeof ScholarPositionSchema>;

export const EventTypeSchema = z.enum([
  "prehistory",
  "origin",
  "development",
  "critique",
  "reception",
  "case",
  "legislation",
  "turn",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const OriginTypeSchema = z.enum(["term", "problem", "case", "statute"]);

export const EventSchema = z.object({
  id: z.string(),
  year: z.number(),
  /** 年份为编者估计 */
  circa: z.boolean().optional(),
  jurisdiction: z.string(),
  type: EventTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  concepts: z.array(z.string()).default([]),
  scholars: z.array(z.string()).default([]),
  works: z.array(z.string()).default([]),
  derivedFrom: z.array(z.string()).default([]),
  /** 本事件是哪个概念的奇点 */
  originOf: z.string().optional(),
  originType: OriginTypeSchema.optional(),
  ...claim,
});
export type LawEvent = z.infer<typeof EventSchema>;

export const DialogueTurnSchema = z.object({
  id: z.string(),
  scholar: z.string(),
  work: z.string().optional(),
  year: z.number().optional(),
  claim: z.string(),
  respondsTo: z.string().optional(),
});

export const DialogueSchema = z.object({
  id: z.string(),
  title: z.string(),
  concept: z.string(),
  jurisdictions: z.array(z.string()).default([]),
  summary: z.string().optional(),
  turns: z.array(DialogueTurnSchema).min(1),
  ...claim,
});
export type Dialogue = z.infer<typeof DialogueSchema>;

export const RelationTypeSchema = z.enum([
  "is_a",
  "part_of",
  "derived_from",
  "opposes",
  "functional_equivalent",
  "transplanted_to",
  "symmetric",
]);
export type RelationType = z.infer<typeof RelationTypeSchema>;

export const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: RelationTypeSchema,
  description: z.string().optional(),
  ...claim,
});
export type Relation = z.infer<typeof RelationSchema>;

export const PlacementSchema = z.object({
  /** scholar:<id> | theory:<id> | jurisdiction:<id>（该法域通说的大致位置） */
  entity: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1).optional(),
  year: z.number().optional(),
  rationale: z.string(),
  /** 跨法系叠加的编者定位（如把英美学者放到大陆光谱上） */
  overlay: z.boolean().optional(),
  ...claim,
});
export type Placement = z.infer<typeof PlacementSchema>;

export const SpectrumSchema = z.object({
  id: z.string(),
  title: z.string(),
  concept: z.string(),
  description: z.string().optional(),
  axes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        left: z.string(),
        right: z.string(),
      }),
    )
    .min(1)
    .max(2),
  placements: z.array(PlacementSchema).default([]),
});
export type Spectrum = z.infer<typeof SpectrumSchema>;

/* ------------------------------------------------------------------ */
/*  内容文件：每个 YAML 文件可以包含任意几种实体的数组                    */
/* ---------------- 教科书论述与罪名卡片（据张明楷《刑法学》等整理） ---------------- */

/** 书中介绍的某一观点；归属以该书的转述为准，不当作原始出处 */
export const ReportedViewSchema = z.object({
  /** 书中对该说的称呼，如「二元论的未遂说」 */
  label: z.string(),
  answer: z.string().nullable().optional(),
  /** 对应本库的学说 */
  theory: z.string().optional(),
  scholars: z.array(z.string()).default([]),
  summary: z.string(),
  pages: z.string(),
});

/** 一本教科书在某个问题上的论述：作者的结论与理由、书中转述的各说 */
export const BookViewSchema = z.object({
  id: z.string(),
  work: z.string(),
  question: z.string(),
  pages: z.string(),
  /** 作者本人的结论（问题的答案 id）；书中未明确表态时为 null */
  answer: z.string().nullable(),
  summary: z.string(),
  reasons: z.array(z.string()).default([]),
  reported: z.array(ReportedViewSchema).default([]),
  ...claim,
});
export type BookView = z.infer<typeof BookViewSchema>;

/** 罪名卡片：内容一律是编者的概括，不是原文 */
export const CrimeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 刑法条文，如「第264条」；没有把握时不填 */
  article: z.string().optional(),
  /** 分则章，如「侵犯财产罪」 */
  chapter: z.string(),
  section: z.string().optional(),
  area: AreaSchema.optional(),
  legalInterest: z.string().optional(),
  elements: z.array(z.string()).default([]),
  /** 关联的问题 */
  issues: z.array(z.string()).default([]),
  /** 此罪与彼罪 */
  related: z.array(z.object({ crime: z.string(), note: z.string() })).default([]),
  ...claim,
});
export type Crime = z.infer<typeof CrimeSchema>;

/* ---------------- 基础词条（问题页上加下划线、点开看释义） ---------------- */

/** 基础术语的释义：编者用自己的话概括，不是原文 */
export const TermSchema = z.object({
  id: z.string(),
  term: z.string(),
  /** 同义的其他写法，同样会被识别并加下划线 */
  aliases: z.array(z.string()).default([]),
  /** 包含本词、但不应标注的词组（如「故意」之于「故意杀人罪」） */
  notIn: z.array(z.string()).default([]),
  original: OriginalTermsSchema,
  /** 一句话释义（40 字以内） */
  short: z.string().max(40),
  /** 展开后的释义（160 字以内） */
  definition: z.string().max(160),
  /** 关联的专题 */
  concept: z.string().optional(),
  ...claim,
});
export type Term = z.infer<typeof TermSchema>;

/* ------------------------------------------------------------------ */

export const ContentFileSchema = z
  .object({
    jurisdictions: z.array(JurisdictionSchema),
    scholars: z.array(ScholarSchema),
    works: z.array(WorkSchema),
    concepts: z.array(ConceptSchema),
    questions: z.array(QuestionSchema),
    prerequisites: z.array(PrerequisiteSchema),
    theories: z.array(TheorySchema),
    positions: z.array(PositionSchema),
    scholarPositions: z.array(ScholarPositionSchema),
    events: z.array(EventSchema),
    dialogues: z.array(DialogueSchema),
    relations: z.array(RelationSchema),
    spectra: z.array(SpectrumSchema),
    scholarWiki: z.array(ScholarWikiSchema),
    bookViews: z.array(BookViewSchema),
    crimes: z.array(CrimeSchema),
    terms: z.array(TermSchema),
  })
  .partial()
  .strict();

export type ContentFile = z.infer<typeof ContentFileSchema>;

export type Db = {
  jurisdictions: Jurisdiction[];
  scholars: Scholar[];
  works: Work[];
  concepts: Concept[];
  questions: Question[];
  prerequisites: Prerequisite[];
  theories: Theory[];
  positions: Position[];
  scholarPositions: ScholarPosition[];
  events: LawEvent[];
  dialogues: Dialogue[];
  relations: Relation[];
  spectra: Spectrum[];
  scholarWiki: ScholarWiki[];
  bookViews: BookView[];
  crimes: Crime[];
  terms: Term[];
};

export const DB_KEYS = [
  "jurisdictions",
  "scholars",
  "works",
  "concepts",
  "questions",
  "prerequisites",
  "theories",
  "positions",
  "scholarPositions",
  "events",
  "dialogues",
  "relations",
  "spectra",
  "scholarWiki",
  "bookViews",
  "crimes",
  "terms",
] as const satisfies readonly (keyof Db)[];

export function emptyDb(): Db {
  return {
    jurisdictions: [],
    scholars: [],
    works: [],
    concepts: [],
    questions: [],
    prerequisites: [],
    theories: [],
    positions: [],
    scholarPositions: [],
    events: [],
    dialogues: [],
    relations: [],
    spectra: [],
    scholarWiki: [],
    bookViews: [],
    crimes: [],
    terms: [],
  };
}

/* ------------------------------------------------------------------ */
/*  显示用标签                                                          */
/* ------------------------------------------------------------------ */

export const PREREQ_KIND_LABEL: Record<PrereqKind, string> = {
  foundational: "根据论先决",
  logical: "逻辑先决",
  systematic: "体系定位先决",
  conceptual: "概念界定先决",
};

export const RELATION_LABEL: Record<RelationType, string> = {
  is_a: "属种（上位/下位）",
  part_of: "构成要素",
  derived_from: "派生自",
  opposes: "对立",
  functional_equivalent: "功能对应",
  transplanted_to: "继受至",
  symmetric: "对称问题",
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  prehistory: "前史",
  origin: "奇点",
  development: "发展",
  critique: "批判",
  reception: "继受",
  case: "判例",
  legislation: "立法",
  turn: "转向",
};

export const AREA_LABEL: Record<Area, string> = {
  foundations: "刑法基础论",
  system: "犯罪论体系",
  tatbestand: "构成要件（客观面）",
  mens: "主观要件：故意·过失·错误",
  unrecht: "违法性",
  schuld: "责任",
  stages: "未完成形态",
  participation: "共犯论",
  sanctions: "刑罚论",
  special: "分论总说与特殊主体",
  "sp-public": "危害公共安全罪",
  "sp-economy": "经济犯罪",
  "sp-person": "侵犯人身权利罪",
  "sp-property": "侵犯财产罪",
  "sp-order": "妨害社会管理秩序罪",
  "sp-duty": "贪污贿赂与渎职罪",
};

export const AREA_ORDER = Object.keys(AREA_LABEL) as Area[];

export const LEVEL_LABEL: Record<QuestionLevel, string> = {
  foundation: "根据论",
  intermediate: "中间问题",
  applied: "具体问题",
};

export const ORIGIN_TYPE_LABEL = {
  term: "术语首次提出",
  problem: "问题首次被意识到",
  case: "判例首次出现",
  statute: "立法首次规定",
} as const;
