import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../src/lib/auth";
import { openMemoryDb, useDb } from "../src/lib/db";
import { addFeedback, listFeedback, updateFeedback, validateFeedback } from "../src/lib/feedback";

beforeEach(() => useDb(openMemoryDb()));

describe("建议与纠错", () => {
  it("校验类型与长度", () => {
    expect(validateFeedback({ kind: "error", body: "第 313 页的页码写错了" })).toBeNull();
    expect(validateFeedback({ kind: "nonsense", body: "内容内容内容" })).toMatch(/类型/);
    expect(validateFeedback({ kind: "bug", body: "短" })).toMatch(/5 个字/);
    expect(validateFeedback({ kind: "bug", body: "x".repeat(2001) })).toMatch(/2000/);
  });

  it("匿名与登录用户都能提交；用户只看到自己的反馈；处理状态与回复可以更新", () => {
    const u = createUser("dora", "password-123");
    if (u === "taken") throw new Error();
    addFeedback(null, { kind: "suggestion", body: "希望增加罪数论专题" });
    const id = addFeedback(u.id, { kind: "error", body: "偶然防卫的页码有误", target: "bookViews:zmk7-ad-treatment", page: "/question/q-ad-treatment/" });
    expect(listFeedback()).toHaveLength(2);
    const mine = listFeedback({ userId: u.id });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: "error", target: "bookViews:zmk7-ad-treatment", status: "new", username: "dora" });
    expect(updateFeedback(id, "fixed", "已改正，谢谢")).toBe(true);
    expect(listFeedback({ status: "fixed" })[0]).toMatchObject({ id, reply: "已改正，谢谢" });
    expect(updateFeedback(9999, "fixed", null)).toBe(false);
  });
});
