import { beforeEach, describe, expect, it } from "vitest";
import { createSession, createUser, destroySession, getState, putState, userFromToken, validateCredentials, verifyUser } from "../src/lib/auth";
import { openMemoryDb, useDb } from "../src/lib/db";
import { readCookie, sameOrigin } from "../src/lib/http";

beforeEach(() => useDb(openMemoryDb()));

describe("账号", () => {
  it("校验用户名和密码的格式", () => {
    expect(validateCredentials("张三", "12345678")).toBeNull();
    expect(validateCredentials("a", "12345678")).toMatch(/用户名/);
    expect(validateCredentials("bad name!", "12345678")).toMatch(/用户名/);
    expect(validateCredentials("alice", "short")).toMatch(/密码/);
  });

  it("注册后可以登录，密码错误或重名会被拒绝", () => {
    const u = createUser("alice", "correct-horse");
    expect(u).not.toBe("taken");
    expect(createUser("ALICE", "another-pass")).toBe("taken");
    expect(verifyUser("alice", "correct-horse")?.username).toBe("alice");
    expect(verifyUser("alice", "wrong-password")).toBeNull();
    expect(verifyUser("nobody", "whatever-123")).toBeNull();
  });

  it("会话令牌可以识别用户，退出后失效", () => {
    const u = createUser("bob", "password-123");
    if (u === "taken") throw new Error();
    const { token } = createSession(u.id);
    expect(userFromToken(token)?.id).toBe(u.id);
    expect(userFromToken("forged-token")).toBeNull();
    destroySession(token);
    expect(userFromToken(token)).toBeNull();
  });
});

describe("同步", () => {
  it("按最后修改时间合并：旧的写入不会覆盖新的", () => {
    const u = createUser("carol", "password-123");
    if (u === "taken") throw new Error();
    expect(putState(u.id, "theme", "green", 200).value).toBe("green");
    // 另一台设备上更早的修改
    expect(putState(u.id, "theme", "dark", 100)).toEqual({ value: "green", updatedAt: 200 });
    expect(putState(u.id, "theme", "sepia", 300).value).toBe("sepia");
    expect(getState(u.id).theme).toEqual({ value: "sepia", updatedAt: 300 });
  });
});

describe("请求工具", () => {
  it("读取 cookie 与同源检查", () => {
    const req = new Request("http://localhost:3000/api/x", { headers: { cookie: "a=1; fm_session=abc%3D", origin: "http://localhost:3000", host: "localhost:3000" } });
    expect(readCookie(req, "fm_session")).toBe("abc=");
    expect(sameOrigin(req)).toBe(true);
    const evil = new Request("http://localhost:3000/api/x", { headers: { origin: "https://evil.example", host: "localhost:3000" } });
    expect(sameOrigin(evil)).toBe(false);
  });
});
