import type { ReactNode } from "react";
import PageToc, { type TocItem } from "./PageToc";

/** 带页内目录的两栏布局：左栏目录（手机上收成顶部细栏），右栏正文 */
export default function TocLayout({ items, title, children }: { items: TocItem[]; title?: string; children: ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
      <PageToc items={items} title={title} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
