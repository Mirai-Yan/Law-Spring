"use client";

import { useSynced } from "@/lib/account";
import { IconBookmark } from "./icons";

export type Bookmark = { href: string; title: string; kind: string; at: number };

/** 收藏按钮：收藏列表随账号同步，在「我的账户」中查看 */
export default function BookmarkButton({ href, title, kind }: { href: string; title: string; kind: string }) {
  const [list, setList] = useSynced<Bookmark[]>("bookmarks", []);
  const on = list.some((b) => b.href === href);
  return (
    <button
      type="button"
      className="btn !px-2.5 !py-0.5 !text-[13px]"
      aria-pressed={on}
      onClick={() => setList(on ? list.filter((b) => b.href !== href) : [{ href, title, kind, at: Date.now() }, ...list].slice(0, 500))}
      title={on ? "取消收藏" : "收藏到「我的账户」"}
    >
      <IconBookmark size={15} filled={on} />
      {on ? "已收藏" : "收藏"}
    </button>
  );
}
