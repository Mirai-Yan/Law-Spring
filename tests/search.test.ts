import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent } from "@/lib/load";
import { MATCH_THRESHOLD, makeSearcher } from "@/lib/search";

const { db } = loadContent(path.resolve(__dirname, "../content"));
const search = makeSearcher(db.questions, db.concepts);
const top = (q: string) => search(q)[0];

describe("提问检索", () => {
  it.each([
    ["偶然防卫怎么处理", "q-ad-treatment"],
    ["向空床开枪是未遂还是不能犯", "q-empty-bed"],
    ["行为无价值和结果无价值", "q-unrecht-core"],
    ["假想防卫", "q-pd-treatment"],
    ["陷害教唆", "q-comp-provocateur"],
    ["Shivpuri", "q-cl-impossible"],
    ["被害人承诺为什么阻却违法", "q-consent"],
    ["正犯与共犯的区分", "q-perpetrator-criterion"],
    ["因果关系中的介入因素", "q-intervening-act"],
    ["污染环境罪的因果关系", "q-epidemiological"],
    ["打击错误", "q-aberratio"],
    ["防卫过当", "q-excessive-defense"],
    ["中止的自动性", "q-voluntariness"],
    ["法人能否犯罪", "q-corp-possible"],
    ["醉酒的人犯罪", "q-intoxication"],
    ["期待可能性", "q-expectability"],
    ["罪刑法定", "q-legality-basis"],
    ["罪数论中的想象竞合", "q-crossing-statutes"],
    ["承继的共犯", "q-successive-time"],
    ["盗窃罪的既遂标准是什么", "q-theft-completion"],
  ])("「%s」匹配到 %s", (q, id) => {
    const hit = top(q);
    expect(hit.question.id).toBe(id);
    expect(hit.score).toBeLessThanOrEqual(MATCH_THRESHOLD);
  });

  it.each(["非法吸收公众存款罪的认定", "缓刑的撤销条件", "诽谤罪的真实性抗辩"])("库外问题「%s」不应被当作已收录", (q) => {
    const hit = top(q);
    expect(!hit || hit.score > MATCH_THRESHOLD).toBe(true);
  });
});
