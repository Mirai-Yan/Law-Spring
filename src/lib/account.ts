"use client";

import { useEffect, useState } from "react";
import { ONLINE_DEMO } from "./deploy";

/**
 * 浏览器端的账号与同步。
 * - 同步数据先写本机（localStorage），登录后再与服务器按「最后修改时间」合并，较新的一方胜。
 * - 不登录也能正常使用，只是数据只在这台设备上。
 */

export type User = { id: number; username: string; admin: boolean };
export type SyncKey = "practice" | "theme" | "bookmarks";
type Rec<T> = { value: T; updatedAt: number };

export const SYNC_EVENT = "fm:sync";
const USER_EVENT = "fm:user";
const LS = (key: SyncKey) => `fm-sync:${key}`;

/* ---------------- 当前用户 ---------------- */

let user: User | null | undefined = ONLINE_DEMO ? null : undefined; // undefined = 尚未查询；线上演示版没有账号
let loading: Promise<User | null> | null = null;

export function fetchUser(force = false): Promise<User | null> {
  if (ONLINE_DEMO) return Promise.resolve(null);
  if (!force && user !== undefined) return Promise.resolve(user);
  if (!force && loading) return loading;
  loading = fetch("/api/auth/me/", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { user: null }))
    .catch(() => ({ user: null }))
    .then((d: { user: User | null }) => {
      user = d.user;
      loading = null;
      window.dispatchEvent(new Event(USER_EVENT));
      return user;
    });
  return loading;
}

export function useUser(): { user: User | null; ready: boolean } {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({ user: user ?? null, ready: user !== undefined });
  useEffect(() => {
    const on = () => setState({ user: user ?? null, ready: user !== undefined });
    window.addEventListener(USER_EVENT, on);
    fetchUser().then(on);
    return () => window.removeEventListener(USER_EVENT, on);
  }, []);
  return state;
}

async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `请求失败（${r.status}）`);
  return d;
}

export async function login(username: string, password: string, register = false) {
  const d = await post(register ? "/api/auth/register/" : "/api/auth/login/", { username, password });
  user = d.user;
  window.dispatchEvent(new Event(USER_EVENT));
  await syncAll();
  return user!;
}

export async function logout() {
  await post("/api/auth/logout/").catch(() => {});
  user = null;
  window.dispatchEvent(new Event(USER_EVENT));
}

/* ---------------- 同步数据 ---------------- */

export function readLocal<T>(key: SyncKey): Rec<T> | null {
  try {
    const raw = localStorage.getItem(LS(key));
    return raw ? (JSON.parse(raw) as Rec<T>) : null;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: SyncKey, rec: Rec<T>) {
  try {
    localStorage.setItem(LS(key), JSON.stringify(rec));
  } catch {
    /* 本机无法保存时只在本次生效 */
  }
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key } }));
}

async function push<T>(key: SyncKey, rec: Rec<T>) {
  const r = await fetch("/api/sync/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: rec.value, updatedAt: rec.updatedAt }),
  });
  if (!r.ok) return;
  const { record } = (await r.json()) as { record: Rec<T> };
  // 服务器上的版本更新时，以服务器为准
  if (record.updatedAt > rec.updatedAt) writeLocal(key, record);
}

/** 写入一项同步数据：先写本机，登录时再推送到服务器 */
export function setSynced<T>(key: SyncKey, value: T) {
  const rec = { value, updatedAt: Date.now() };
  writeLocal(key, rec);
  fetchUser().then((u) => {
    if (u) push(key, rec).catch(() => {});
  });
}

/** 登录后（或已登录的页面打开时）与服务器合并全部同步项 */
export async function syncAll(): Promise<void> {
  if (ONLINE_DEMO) return;
  const r = await fetch("/api/sync/", { cache: "no-store" });
  if (!r.ok) return;
  const { state } = (await r.json()) as { state: Partial<Record<SyncKey, Rec<unknown>>> };
  for (const key of ["practice", "theme", "bookmarks"] as SyncKey[]) {
    const local = readLocal(key);
    const remote = state[key];
    if (remote && (!local || remote.updatedAt > local.updatedAt)) writeLocal(key, remote);
    else if (local && (!remote || local.updatedAt > remote.updatedAt)) await push(key, local).catch(() => {});
  }
}

let synced = false;
/** 每次打开页面时，若已登录则合并一次 */
export function syncOnce() {
  if (synced) return;
  synced = true;
  fetchUser().then((u) => {
    if (u) syncAll().catch(() => {});
  });
}

/** 订阅某个同步项（本机修改、其他标签页修改或从服务器拉下新版本时都会更新） */
export function useSynced<T>(key: SyncKey, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => {
    const load = () => setV(readLocal<T>(key)?.value ?? fallback);
    load();
    const onSync = (e: Event) => {
      if ((e as CustomEvent).detail?.key === key) load();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS(key)) load();
    };
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener("storage", onStorage);
    };
    // fallback 只在首次使用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [v, (nv: T) => setSynced(key, nv)];
}
