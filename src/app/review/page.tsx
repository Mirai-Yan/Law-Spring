import ReviewList, { type ReviewItem } from "@/components/ReviewList";
import { PageHeader } from "@/components/ui";
import WikidataReview from "@/components/WikidataReview";
import { getContent } from "@/lib/content";
import { ANCHOR_FILE, readAnchors } from "@/lib/ingest/anchors";
import { entityKey } from "@/lib/load";
import { DB_KEYS, RELATION_LABEL } from "@/lib/schema";
import { workCitation } from "@/lib/view";

export const metadata = { title: "审核台 · 法脉·刑法学" };

const KIND_LABEL: Record<string, string> = {
  jurisdictions: "法域",
  scholars: "学者",
  works: "文献",
  concepts: "概念",
  questions: "问题",
  prerequisites: "先决关系",
  theories: "学说",
  positions: "立场",
  scholarPositions: "学者偏离",
  events: "事件",
  dialogues: "对话",
  relations: "概念关系",
  spectra: "光谱定位",
  bookViews: "教科书论述",
  crimes: "罪名卡片",
};

/** 开发模式：审核台可以直接改 status，并显示本机私有的原文锚点（线上构建不包含这两样） */
const DEV = process.env.NODE_ENV === "development";

export default function ReviewPage() {
  const { ix, locations } = getContent();
  const { db } = ix;
  const items: ReviewItem[] = [];
  const anchors = DEV ? readAnchors(ANCHOR_FILE) : [];
  const q = (id: string) => ix.question.get(id)?.text ?? id;

  for (const kind of DB_KEYS) {
    // 法域不需要核对；Wikidata 资料不是本库的学术主张，单独在下方「Wikidata 待审核」中处理
    if (kind === "jurisdictions" || kind === "scholarWiki") continue;
    for (const raw of db[kind] as unknown as Record<string, unknown>[]) {
      const key = entityKey(kind, raw);
      const file = locations[key] ?? "?";
      const base = { kind, kindLabel: KIND_LABEL[kind], file };
      const it = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (kind === "spectra") {
        for (const p of it.placements) {
          const [ek, eid] = String(p.entity).split(":");
          const jurisdiction = ek === "scholar" ? ix.scholar.get(eid)?.jurisdiction : ek === "jurisdiction" ? eid : undefined;
          const label = ek === "scholar" ? ix.scholar.get(eid)?.name : ek === "jurisdiction" ? `${ix.jurisdiction.get(eid)?.name}通说` : eid;
          items.push({ ...base, key: `${key}/${p.entity}@${p.year}`, label: `${it.title} · ${label}（${p.year ?? ""}）：${p.rationale}`, jurisdiction, status: p.status, needsSource: !!p.needsSource, href: `/spectrum/${it.id}/` });
        }
        continue;
      }
      let label = "";
      let jurisdiction: string | undefined;
      let href: string | undefined;
      switch (kind) {
        case "scholars":
          label = `${it.name}${it.nameOriginal && it.nameOriginal !== it.name ? `（${it.nameOriginal}）` : ""}`;
          jurisdiction = it.jurisdiction;
          href = `/scholar/${it.id}/`;
          break;
        case "works":
          label = workCitation(ix, it.id);
          jurisdiction = it.jurisdiction;
          break;
        case "concepts":
          label = it.name;
          href = `/concept/${it.id}/`;
          break;
        case "questions":
          label = it.text;
          href = `/question/${it.id}/`;
          break;
        case "prerequisites":
          label = `${q(it.question)} ← ${q(it.requires)}`;
          href = `/question/${it.question}/`;
          break;
        case "theories":
          label = it.name;
          href = `/lens/?theory=${it.id}`;
          break;
        case "positions":
          label = `${ix.theory.get(it.theory)?.name} · ${q(it.question)}`;
          href = `/question/${it.question}/`;
          break;
        case "scholarPositions":
          label = `${ix.scholar.get(it.scholar)?.name} · ${q(it.question)}`;
          jurisdiction = ix.scholar.get(it.scholar)?.jurisdiction;
          href = `/scholar/${it.scholar}/`;
          break;
        case "events":
          label = `${it.year}${it.circa ? "（约）" : ""} ${it.title}`;
          jurisdiction = it.jurisdiction;
          href = `/jurisdiction/${it.jurisdiction}/#${it.id}`;
          break;
        case "dialogues":
          label = it.title;
          href = `/concept/${it.concept}/?tab=dialogue`;
          break;
        case "relations":
          label = `${ix.concept.get(it.from)?.name} —${RELATION_LABEL[it.type as keyof typeof RELATION_LABEL]}→ ${ix.concept.get(it.to)?.name}`;
          break;
        case "bookViews": {
          const ans = it.answer ? ix.question.get(it.question)?.answers.find((a) => a.id === it.answer)?.label : "未明确表态";
          label = `${q(it.question)} —— 作者结论：${ans ?? it.answer}（第 ${it.pages} 页）`;
          href = `/question/${it.question}/`;
          break;
        }
        case "crimes":
          label = `${it.name}${it.article ? `（${it.article}）` : "（条文待查）"}`;
          href = `/crime/${it.id}/`;
          break;
      }
      const anchorList =
        kind === "bookViews"
          ? anchors
              .filter((a) => a.key === key || a.key.startsWith(`${key}#`))
              .map((a) => {
                const n = a.key.split("#")[1];
                return { page: a.page, text: a.text, of: n === undefined ? "作者结论" : `转述：${it.reported?.[Number(n)]?.label ?? n}` };
              })
          : undefined;
      items.push({ ...base, key, label, jurisdiction, status: it.status, needsSource: !!it.needsSource, note: it.editorNote, href, anchors: anchorList });
    }
  }

  const pending = items.filter((i) => i.status !== "verified").length;
  const ns = items.filter((i) => i.needsSource).length;

  return (
    <>
      <PageHeader eyebrow="审核台" title="逐条核对 AI 起草的内容">
        <p className="max-w-3xl text-ink-2">
          共 {items.length} 条，待核实 <span className="font-semibold tabular-nums">{pending}</span> 条，其中缺出处{" "}
          <span className="font-semibold tabular-nums">{ns}</span> 条。
          {DEV ? (
            <>
              本机开发模式下，每条右侧有「核对通过」「存疑」按钮，点击后直接写回对应 YAML 的 <code>status</code>；教科书论述下方列出本机私有的原文锚点和印刷页码，方便翻书对照。
            </>
          ) : (
            <>
              核对原文后，在对应的 YAML 文件里把 <code>status</code> 改为 <code>verified</code> 并补上 <code>sources</code>；有疑问的改为 <code>disputed</code>。
            </>
          )}{" "}
          命令行里可以用 <code>npm run review:list</code> 得到同样的清单。
        </p>
      </PageHeader>
      <WikidataReview />
      <ReviewList items={items} jurisdictions={[...db.jurisdictions].sort((a, b) => a.order - b.order)} editable={DEV} />
    </>
  );
}
