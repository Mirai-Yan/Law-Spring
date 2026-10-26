"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { login } from "@/lib/account";

function Form() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/account/";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password, mode === "register");
      router.push(next.startsWith("/") ? next : "/account/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-border bg-surface px-3 py-2";
  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div className="flex gap-1" role="group" aria-label="登录或注册">
        <button type="button" className="btn" aria-pressed={mode === "login"} onClick={() => setMode("login")}>
          登录
        </button>
        <button type="button" className="btn" aria-pressed={mode === "register"} onClick={() => setMode("register")}>
          注册
        </button>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-ink-2">用户名</span>
        <input className={field} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={2} maxLength={20} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-ink-2">密码</span>
        <input
          className={field}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={8}
        />
        {mode === "register" && <span className="mt-1 block text-xs text-ink-3">至少 8 个字符。请不要使用你在其他网站用过的密码。</span>}
      </label>
      {error && (
        <p className="text-sm" role="alert" style={{ color: "var(--status-serious)" }}>
          {error}
        </p>
      )}
      <button className="btn btn-primary w-full !py-2" disabled={busy}>
        {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"}
      </button>
    </form>
  );
}

export default function LoginForm() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
