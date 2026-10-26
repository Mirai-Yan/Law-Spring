"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ONLINE_DEMO } from "@/lib/deploy";

/** 条目旁的「纠错」小入口：打开反馈页并带上条目编号与当前页面 */
export default function ReportLink({ target, label = "纠错" }: { target: string; label?: string }) {
  const page = usePathname();
  if (ONLINE_DEMO) return null;
  const q = new URLSearchParams({ kind: "error", target, page });
  return (
    <Link href={`/feedback/?${q}`} className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline" title="这条内容有误？告诉我们">
      {label}
    </Link>
  );
}
