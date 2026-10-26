import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import Link from "next/link";

type Pending = {
  scholar: string;
  name: string;
  nameOriginal?: string;
  ours: { born?: number; died?: number };
  confirm: string;
  candidates: { qid: string; label?: string; description?: string; born?: string; died?: string; score: number; reasons: string[]; url: string }[];
};
type Diff = { scholar: string; name: string; field: string; ours: string; wikidata: string; note: string };

function readYaml<T>(rel: string, key: string): T[] {
  try {
    const raw = yaml.load(fs.readFileSync(path.resolve(rel), "utf8")) as Record<string, T[]> | null;
    return raw?.[key] ?? [];
  } catch {
    return [];
  }
}

/** 审核台上的 Wikidata 部分：匹配不确定的学者，以及本库与 Wikidata 不一致之处 */
export default function WikidataReview() {
  const pending = readYaml<Pending>("content/_review/wikidata-pending.yaml", "pending").filter((p) => !p.confirm);
  const diffs = readYaml<Diff>("content/_review/wikidata-diff.yaml", "diffs");
  if (pending.length === 0 && diffs.length === 0) return null;

  return (
    <section className="mb-10 space-y-6">
      {pending.length > 0 && (
        <div>
          <h2 className="section-title">Wikidata 待审核（{pending.length} 人）</h2>
          <p className="mb-3 mt-1 max-w-3xl text-sm text-ink-3">
            这些学者在 Wikidata 上找不到把握足够大的匹配，暂未写入基本信息。确认是同一人后，在{" "}
            <code>content/_review/wikidata-pending.yaml</code> 对应条目的 <code>confirm</code> 填 Q 编号（没有此人就填 <code>none</code>），再运行{" "}
            <code>npm run wiki:scholars</code>。
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {pending.map((p) => (
              <li key={p.scholar} className="card p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link href={`/scholar/${p.scholar}/`} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                  {p.nameOriginal && <span className="text-ink-3">{p.nameOriginal}</span>}
                  <span className="text-xs text-ink-3">
                    本库：{p.ours.born ?? "?"}—{p.ours.died ?? ""}
                  </span>
                </div>
                {p.candidates.length === 0 ? (
                  <p className="mt-1 text-ink-3">没有找到候选。</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {p.candidates.map((c) => (
                      <li key={c.qid} className="text-ink-2">
                        <a href={c.url} target="_blank" rel="noreferrer" className="link">
                          {c.qid}
                        </a>{" "}
                        {c.label}
                        <span className="text-ink-3">
                          {" "}
                          {c.born ?? "?"}—{c.died ?? ""} · {c.description ?? "无描述"} · {c.score} 分（{c.reasons.join("、") || "无吻合项"}）
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {diffs.length > 0 && (
        <div>
          <h2 className="section-title">本库与 Wikidata 不一致（{diffs.length} 处）</h2>
          <p className="mb-3 mt-1 max-w-3xl text-sm text-ink-3">Wikidata 也可能有误，这里只是提示需要回到原始文献核对的地方。</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-ink-3">
                <tr>
                  <th className="py-1 pr-3 font-normal">学者</th>
                  <th className="py-1 pr-3 font-normal">项目</th>
                  <th className="py-1 pr-3 font-normal">本库</th>
                  <th className="py-1 pr-3 font-normal">Wikidata</th>
                  <th className="py-1 font-normal">说明</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="py-1.5 pr-3">
                      <Link href={`/scholar/${d.scholar}/`} className="link">
                        {d.name}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">{d.field}</td>
                    <td className="py-1.5 pr-3 text-ink-2">{d.ours}</td>
                    <td className="py-1.5 pr-3 text-ink-2">{d.wikidata}</td>
                    <td className="py-1.5 text-ink-3">{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
