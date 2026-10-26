/**
 * npm run wiki:scholars
 * 从 Wikidata 为学者补齐基本信息，写入 content/wikidata/scholars.yaml（不改动学者条目本身）。
 *
 * - 只有把握很大的匹配才自动写入；拿不准的放进 content/_review/wikidata-pending.yaml，
 *   在条目的 confirm 字段填 Q 编号（或 none 表示 Wikidata 上没有此人）后重新运行即可。
 * - 与本库记录不一致的生卒年、师承，列在 content/_review/wikidata-diff.yaml。
 * - 照片只取可自由使用许可的，下载到 public/scholars/，网站运行时不访问维基服务器。
 * - Wikidata 的数据以 CC0 发布；维基百科正文不复制，只记链接。
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 处理的是结构不固定的 Wikidata 原始 JSON */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { loadContent } from "../src/lib/load";
import type { Scholar, ScholarWiki } from "../src/lib/schema";

const ROOT = path.resolve(".");
const OUT = path.join(ROOT, "content/wikidata/scholars.yaml");
const PENDING = path.join(ROOT, "content/_review/wikidata-pending.yaml");
const DIFF = path.join(ROOT, "content/_review/wikidata-diff.yaml");
const IMG_DIR = path.join(ROOT, "public/scholars");
const UA = "crimlaw-atlas/0.1 (non-commercial educational project)";
const TODAY = new Date().toISOString().slice(0, 10);

const SEARCH_LANG: Record<string, string> = { de: "de", jp: "ja", tw: "zh", cn: "zh", us: "en", "uk-ew": "en" };
const COUNTRY: Record<string, string[]> = {
  de: ["Q183", "Q43287", "Q41304", "Q7318", "Q713750", "Q16957", "Q27306", "Q150981", "Q151624", "Q40", "Q39"],
  jp: ["Q17", "Q188712"],
  tw: ["Q865", "Q13426199"],
  cn: ["Q148", "Q13426199", "Q865"],
  us: ["Q30"],
  "uk-ew": ["Q145", "Q21", "Q174193", "Q161885"],
};
const LAW_OCC = new Set(["Q185351", "Q40348", "Q16533", "Q1622272", "Q121594", "Q4964182", "Q1238570"]);
const LAW_DESC = /jurist|law|legal|criminolog|judge|Jurist|Rechts|Straf|Richter|法学|法律|刑法|法官|律师|法學|法律家|刑事/;
const FREE_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? ?[0-9.]*|CC-BY(-SA)?-?[0-9.]*)/i;

/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 每个请求的结果缓存到本地，中断后重跑可以接着来，也不重复打扰 Wikidata
const CACHE = path.join(ROOT, ".cache/wikidata");
fs.mkdirSync(CACHE, { recursive: true });
const cacheFile = (url: string) => path.join(CACHE, createHash("sha1").update(url).digest("hex") + ".json");

let lastCall = 0;
async function getJson(url: string, tries = 7): Promise<any> {
  const cf = cacheFile(url);
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, "utf8"));
  for (let i = 0; i < tries; i++) {
    // 两次请求之间至少间隔 400 毫秒，避免触发限流
    const wait = lastCall + 400 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.status === 429 || r.status >= 500) {
      const ra = Number(r.headers.get("retry-after"));
      const ms = Math.min(60_000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** i);
      process.stdout.write(`  （限流，等待 ${Math.round(ms / 1000)} 秒）\n`);
      await sleep(ms);
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    const j = await r.json();
    fs.writeFileSync(cf, JSON.stringify(j));
    return j;
  }
  throw new Error(`多次重试仍失败：${url}`);
}

function wd(params: Record<string, string>) {
  const u = new URL("https://www.wikidata.org/w/api.php");
  for (const [k, v] of Object.entries({ ...params, format: "json" })) u.searchParams.set(k, v);
  return getJson(u.toString());
}

async function search(term: string, lang: string): Promise<string[]> {
  const r = await wd({ action: "wbsearchentities", search: term, language: lang, uselang: lang, type: "item", limit: "7" });
  return (r.search ?? []).map((x: { id: string }) => x.id);
}

const entityCache = new Map<string, any>();
async function entities(ids: string[]): Promise<Map<string, any>> {
  const need = [...new Set(ids)].filter((id) => !entityCache.has(id));
  for (let i = 0; i < need.length; i += 45) {
    const r = await wd({
      action: "wbgetentities",
      ids: need.slice(i, i + 45).join("|"),
      props: "labels|aliases|descriptions|claims|sitelinks",
      languages: "zh-hans|zh-cn|zh|zh-hant|zh-tw|en|de|ja",
    });
    for (const [id, e] of Object.entries(r.entities ?? {})) entityCache.set(id, e);
    await sleep(150);
  }
  return new Map(ids.map((id) => [id, entityCache.get(id)]));
}

/* ---------------- 取值工具 ---------------- */

const ZH = ["zh-hans", "zh-cn", "zh", "zh-hant", "zh-tw"];
function pickLang(obj: Record<string, { value: string }> | undefined, prefer: string[]): string | undefined {
  if (!obj) return undefined;
  for (const l of prefer) if (obj[l]?.value) return obj[l].value;
  return undefined;
}
const labelOf = (e: any, orig?: string) => pickLang(e?.labels, [...ZH, ...(orig ? [orig] : []), "en", "de", "ja"]);
const claimIds = (e: any, p: string): string[] =>
  (e?.claims?.[p] ?? []).map((c: any) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
function claimTime(e: any, p: string): { text: string; year: number } | undefined {
  const v = e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
  if (!v?.time) return undefined;
  const m = /^([+-])(\d+)-(\d\d)-(\d\d)/.exec(v.time);
  if (!m) return undefined;
  const year = (m[1] === "-" ? -1 : 1) * Number(m[2]);
  const text = v.precision >= 11 ? `${m[2]}-${m[3]}-${m[4]}` : v.precision === 10 ? `${m[2]}-${m[3]}` : String(year);
  return { text: text.replace(/^0+/, ""), year };
}
const norm = (s?: string) =>
  (s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^sir\s+/, "")
    .replace(/[\s.\-·・,，()（）'’]/g, "");

/* ---------------- 打分 ---------------- */

type Cand = { qid: string; score: number; reasons: string[]; e: any };

function scoreCandidate(s: Scholar, e: any): Cand | null {
  if (!claimIds(e, "P31").includes("Q5")) return null; // 不是人
  const reasons: string[] = [];
  let score = 0;
  const names = new Set<string>();
  for (const l of Object.values(e.labels ?? {}) as { value: string }[]) names.add(norm(l.value));
  for (const list of Object.values(e.aliases ?? {}) as { value: string }[][]) for (const a of list) names.add(norm(a.value));
  if (names.has(norm(s.nameOriginal)) || names.has(norm(s.name))) {
    score += 3;
    reasons.push("姓名一致");
  }
  const born = claimTime(e, "P569");
  const add = (n: number, why: string) => {
    score += n;
    reasons.push(why);
  };
  if (s.born && born) {
    const d = Math.abs(born.year - s.born);
    if (d === 0) add(4, "出生年一致");
    else if (d === 1) add(2, "出生年相差一年");
    else add(-6, `出生年不符（${born.year}）`);
  }
  const died = claimTime(e, "P570");
  if (s.died && died) {
    if (Math.abs(died.year - s.died) <= 1) add(2, "去世年一致");
    else add(-3, `去世年不符（${died.year}）`);
  }
  const desc = Object.values(e.descriptions ?? {})
    .map((d: any) => d.value)
    .join(" ");
  if (claimIds(e, "P106").some((o) => LAW_OCC.has(o)) || LAW_DESC.test(desc)) add(2, "法学或相关职业");
  if (claimIds(e, "P27").some((c) => (COUNTRY[s.jurisdiction] ?? []).includes(c))) add(1, "国籍吻合");
  return { qid: e.id, score, reasons, e };
}

/* ---------------- 照片 ---------------- */

async function fetchImage(scholarId: string, e: any): Promise<ScholarWiki["image"]> {
  const file = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return undefined;
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "240", format: "json" }))
    u.searchParams.set(k, v);
  const r = await getJson(u.toString());
  const info: any = Object.values(r.query?.pages ?? {})[0];
  const ii = info?.imageinfo?.[0];
  const license = ii?.extmetadata?.LicenseShortName?.value as string | undefined;
  if (!ii?.thumburl || !license || !FREE_LICENSE.test(license)) return undefined;
  const artist = String(ii.extmetadata?.Artist?.value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const ext = (path.extname(new URL(ii.thumburl).pathname) || ".jpg").toLowerCase();
  const img = await fetch(ii.thumburl, { headers: { "User-Agent": UA } });
  if (!img.ok) return undefined;
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const name = `${scholarId}${ext}`;
  fs.writeFileSync(path.join(IMG_DIR, name), Buffer.from(await img.arrayBuffer()));
  return { src: `/scholars/${name}`, page: ii.descriptionurl, license, credit: artist || "Wikimedia Commons" };
}

/* ---------------- 主流程 ---------------- */

type PendingEntry = {
  scholar: string;
  name: string;
  nameOriginal?: string;
  ours: { born?: number; died?: number };
  /** 填 Q 编号确认，或填 none 表示 Wikidata 上没有此人 */
  confirm: string;
  candidates: { qid: string; label?: string; description?: string; born?: string; died?: string; score: number; reasons: string[]; url: string }[];
};

async function main() {
  const { db } = loadContent(path.join(ROOT, "content"));
  const oldPending: PendingEntry[] = fs.existsSync(PENDING) ? ((yaml.load(fs.readFileSync(PENDING, "utf8")) as { pending?: PendingEntry[] })?.pending ?? []) : [];
  const confirmOf = new Map(oldPending.filter((p) => p.confirm).map((p) => [p.scholar, p.confirm.trim()]));

  const matched = new Map<string, { qid: string; by: "auto" | "confirmed" }>();
  const pending: PendingEntry[] = [];

  for (const s of db.scholars) {
    const c = confirmOf.get(s.id);
    if (c && /^Q\d+$/.test(c)) {
      matched.set(s.id, { qid: c, by: "confirmed" });
      continue;
    }
    if (c === "none") {
      pending.push({ ...pendingBase(s), confirm: "none", candidates: [] });
      continue;
    }
    const lang = SEARCH_LANG[s.jurisdiction] ?? "en";
    const ids = new Set<string>();
    let ents: Map<string, any>;
    try {
      for (const [term, l] of [
        [s.nameOriginal, lang],
        [s.nameOriginal, "en"],
        [s.name, "zh"],
      ] as const) {
        if (!term) continue;
        for (const id of await search(term.replace(/^Sir\s+/, ""), l)) ids.add(id);
      }
      ents = await entities([...ids]);
    } catch (e) {
      process.stdout.write(`! ${s.name}：请求失败，本次跳过（${(e as Error).message.slice(0, 60)}）\n`);
      continue;
    }
    const cands = [...ents.values()]
      .map((e) => e && scoreCandidate(s, e))
      .filter((x): x is Cand => !!x)
      .sort((a, b) => b.score - a.score);
    const [best, second] = cands;
    const bornOk = !best?.reasons.some((r) => r.startsWith("出生年不符"));
    if (best && best.score >= 7 && bornOk && (!second || best.score - second.score >= 3)) {
      matched.set(s.id, { qid: best.qid, by: "auto" });
      process.stdout.write(`✓ ${s.name} → ${best.qid}（${best.reasons.join("、")}）\n`);
    } else {
      pending.push({
        ...pendingBase(s),
        confirm: "",
        candidates: cands.slice(0, 3).map((x) => ({
          qid: x.qid,
          label: labelOf(x.e, SEARCH_LANG[s.jurisdiction]),
          description: pickLang(x.e.descriptions, [...ZH, "en", "de", "ja"]),
          born: claimTime(x.e, "P569")?.text,
          died: claimTime(x.e, "P570")?.text,
          score: x.score,
          reasons: x.reasons,
          url: `https://www.wikidata.org/wiki/${x.qid}`,
        })),
      });
      process.stdout.write(`? ${s.name}：${cands.length ? `最高 ${best.score} 分，待审核` : "没有找到候选"}\n`);
    }
  }

  // 取匹配上的人的完整资料，以及他们引用的机构、导师、学生的名称
  const ents = await entities([...matched.values()].map((m) => m.qid));
  const qidToScholar = new Map([...matched].map(([sid, m]) => [m.qid, sid]));
  const refIds = new Set<string>();
  for (const e of ents.values()) for (const p of ["P27", "P108", "P69", "P184", "P185", "P19"]) claimIds(e, p).forEach((q) => refIds.add(q));
  const refs = await entities([...refIds]);
  const refLabel = (q: string, orig?: string) => labelOf(refs.get(q), orig) ?? q;

  const out: ScholarWiki[] = [];
  const diffs: { scholar: string; name: string; field: string; ours: string; wikidata: string; note: string }[] = [];
  for (const s of db.scholars) {
    const m = matched.get(s.id);
    if (!m) continue;
    const e = ents.get(m.qid);
    if (!e) continue;
    const orig = SEARCH_LANG[s.jurisdiction];
    const born = claimTime(e, "P569");
    const died = claimTime(e, "P570");
    const person = (q: string) => ({ qid: q, label: refLabel(q, orig), ...(qidToScholar.has(q) ? { scholar: qidToScholar.get(q) } : {}) });
    const site = (k: string) => e.sitelinks?.[k]?.title;
    const links: ScholarWiki["links"] = {};
    for (const [k, host] of [
      ["zhwiki", "zh"],
      ["dewiki", "de"],
      ["jawiki", "ja"],
      ["enwiki", "en"],
    ] as const) {
      const t = site(k);
      if (t) links[host] = `https://${host}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;
    }
    let image: ScholarWiki["image"];
    try {
      image = await fetchImage(s.id, e);
    } catch {
      image = undefined;
    }
    const rec: ScholarWiki = {
      scholar: s.id,
      qid: m.qid,
      matchedBy: m.by,
      retrieved: TODAY,
      label: pickLang(e.labels, [orig ?? "en", "en", ...ZH]),
      description: pickLang(e.descriptions, [...ZH, "en", "de", "ja"]),
      born: born?.text,
      died: died?.text,
      birthPlace: claimIds(e, "P19")[0] ? refLabel(claimIds(e, "P19")[0], orig) : undefined,
      citizenship: [...new Set(claimIds(e, "P27").map((q) => refLabel(q, orig)))],
      employers: [...new Set(claimIds(e, "P108").map((q) => refLabel(q, orig)))],
      education: [...new Set(claimIds(e, "P69").map((q) => refLabel(q, orig)))],
      advisors: claimIds(e, "P184").map(person),
      students: claimIds(e, "P185").map(person),
      links,
      ...(image ? { image } : {}),
    };
    out.push(JSON.parse(JSON.stringify(rec)));

    // 与本库记录比对
    if (s.born && born && born.year !== s.born) diffs.push({ scholar: s.id, name: s.name, field: "出生年", ours: String(s.born), wikidata: born.text, note: "请核对" });
    if (s.died && died && died.year !== s.died) diffs.push({ scholar: s.id, name: s.name, field: "去世年", ours: String(s.died), wikidata: died.text, note: "请核对" });
    if (!s.died && died) diffs.push({ scholar: s.id, name: s.name, field: "去世年", ours: "（未记录）", wikidata: died.text, note: "本库未记录去世年" });
    for (const a of rec.advisors) {
      if (a.scholar && !s.teachers.includes(a.scholar))
        diffs.push({ scholar: s.id, name: s.name, field: "师承", ours: s.teachers.join("、") || "（无）", wikidata: `博士导师：${a.label}`, note: "Wikidata 记载的导师在本库中，但师承里没有" });
    }
    for (const t of s.teachers) {
      const tq = matched.get(t)?.qid;
      if (tq && rec.advisors.length && !rec.advisors.some((a) => a.qid === tq))
        diffs.push({ scholar: s.id, name: s.name, field: "师承", ours: `老师：${db.scholars.find((x) => x.id === t)?.name}`, wikidata: `博士导师：${rec.advisors.map((a) => a.label).join("、")}`, note: "两边记载的老师不同（博士导师之外也可能另有师承）" });
    }
    await sleep(100);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    `# 由 npm run wiki:scholars 自动生成，请勿手改；数据来自 Wikidata（CC0），抓取于 ${TODAY}\n` +
      yaml.dump({ scholarWiki: out }, { lineWidth: -1, noRefs: true }),
  );
  fs.mkdirSync(path.dirname(PENDING), { recursive: true });
  fs.writeFileSync(
    PENDING,
    "# Wikidata 匹配待审核：在 confirm 填 Q 编号（确认是同一人）或 none（Wikidata 上没有此人），然后重新运行 npm run wiki:scholars\n" +
      yaml.dump({ pending }, { lineWidth: -1, noRefs: true }),
  );
  fs.writeFileSync(DIFF, `# 本库记录与 Wikidata 不一致之处（${TODAY}），供核对；以原始文献为准\n` + yaml.dump({ diffs }, { lineWidth: -1, noRefs: true }));

  console.log(`\n自动匹配 ${[...matched.values()].filter((m) => m.by === "auto").length} 人，已确认 ${[...matched.values()].filter((m) => m.by === "confirmed").length} 人，待审核 ${pending.filter((p) => !p.confirm).length} 人；照片 ${out.filter((o) => o.image).length} 张；不一致 ${diffs.length} 处。`);
}

function pendingBase(s: Scholar) {
  return { scholar: s.id, name: s.name, ...(s.nameOriginal ? { nameOriginal: s.nameOriginal } : {}), ours: { born: s.born, died: s.died } };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
