"use client";

import Link from "next/link";
import { useState } from "react";
import { logout, syncAll, useSynced, useUser } from "@/lib/account";
import { ONLINE_DEMO } from "@/lib/deploy";
import type { Bookmark } from "./BookmarkButton";
import type { PracticeStats } from "./PracticeClient";

export default function AccountClient() {
  const { user, ready } = useUser();
  const [bookmarks, setBookmarks] = useSynced<Bookmark[]>("bookmarks", []);
  const [practice] = useSynced<PracticeStats | null>("practice", null);
  const [syncing, setSyncing] = useState(false);

  if (!ready) return null;
  if (!user && !ONLINE_DEMO)
    return (
      <div className="card p-5 text-sm">
        还没有登录。<Link href="/login/?next=/account/" className="link">登录或注册</Link>后，练习进度、主题、收藏会在你的设备之间同步。
      </div>
    );

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {user ? (
        <section className="card space-y-3 p-5 text-sm">
          <div>
            <div className="text-ink-3">用户名</div>
            <div className="font-serif text-lg font-bold">{user.username}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn !text-[13px]"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                await syncAll().catch(() => {});
                setSyncing(false);
              }}
            >
              {syncing ? "同步中…" : "立即同步"}
            </button>
            <button className="btn !text-[13px]" onClick={() => logout()}>
              退出登录
            </button>
          </div>
          <p className="text-xs text-ink-3">同步内容：练习进度、界面主题、收藏。个人资料库保存在服务器上，登录后在任何设备都能打开。</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/library/" className="link">
              我的资料库 →
            </Link>
            <Link href="/feedback/" className="link">
              我的反馈 →
            </Link>
          </div>
        </section>
      ) : (
        <section className="card p-5 text-sm text-ink-2">
          这是线上演示版，不提供账号和多设备同步。这里的练习进度和收藏保存在这台设备的浏览器里，换设备或清除浏览器数据后不会保留。
        </section>
      )}

      <section className="card p-5 text-sm">
        <h2 className="section-title !text-base">练习进度</h2>
        {practice && practice.answered > 0 ? (
          <p className="mt-2">
            累计 {practice.answered} 题，答对 {practice.correct} 题（{Math.round((practice.correct / practice.answered) * 100)}%）
          </p>
        ) : (
          <p className="mt-2 text-ink-3">还没有练习记录。</p>
        )}
        <Link href="/practice/" className="link mt-2 inline-block">
          去练习 →
        </Link>
      </section>

      <section className="card p-5 text-sm md:row-span-2">
        <h2 className="section-title !text-base">收藏（{bookmarks.length}）</h2>
        {bookmarks.length === 0 ? (
          <p className="mt-2 text-ink-3">在问题页、专题页点「收藏」，就会出现在这里。</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {bookmarks.map((b) => (
              <li key={b.href} className="flex items-start justify-between gap-2">
                <Link href={b.href} className="hover:underline">
                  <span className="mr-1 text-xs text-ink-3">{b.kind}</span>
                  {b.title}
                </Link>
                <button className="shrink-0 text-xs text-ink-3 hover:text-ink" onClick={() => setBookmarks(bookmarks.filter((x) => x.href !== b.href))}>
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
