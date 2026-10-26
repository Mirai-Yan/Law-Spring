"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout, syncOnce, useUser } from "@/lib/account";
import { ONLINE_DEMO } from "@/lib/deploy";

/** 顶栏右侧的账号入口：未登录时是「登录」，登录后是带菜单的用户名 */
export default function AccountMenu() {
  const { user, ready } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    syncOnce();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (ONLINE_DEMO)
    return (
      <Link href="/account/" className="btn shrink-0 !px-2.5 !py-1 !text-[13px]">
        我的
      </Link>
    );
  if (!ready) return <span className="inline-block w-14 shrink-0" aria-hidden />;
  if (!user)
    return (
      <Link href="/login/" className="btn shrink-0 !px-2.5 !py-1 !text-[13px]">
        登录
      </Link>
    );

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        className="btn !px-2.5 !py-1 !text-[13px]"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden className="grid size-5 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-ink">
          {[...user.username][0]?.toUpperCase()}
        </span>
        <span className="hidden max-w-24 truncate sm:inline">{user.username}</span>
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-full z-50 mt-2 w-44 p-1.5 text-sm">
          <MenuLink href="/account/" onClick={() => setOpen(false)}>
            我的账户
          </MenuLink>
          <MenuLink href="/library/" onClick={() => setOpen(false)}>
            我的资料库
          </MenuLink>
          <MenuLink href="/feedback/" onClick={() => setOpen(false)}>
            建议与纠错
          </MenuLink>
          {user.admin && (
            <MenuLink href="/admin/feedback/" onClick={() => setOpen(false)}>
              反馈后台
            </MenuLink>
          )}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-lg px-2.5 py-1.5 text-left text-ink-2 hover:bg-surface-2 hover:text-ink"
            onClick={async () => {
              await logout();
              setOpen(false);
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onClick} className="block rounded-lg px-2.5 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
      {children}
    </Link>
  );
}
