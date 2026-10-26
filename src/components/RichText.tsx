import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { splitTerms, termLite, termMatcher } from "@/lib/glossary";
import { WIKI_RE, wikiTarget, type Index } from "@/lib/graph";
import Term from "./Term";

/** 基础词条的标注范围：同一个 scope 里每个词只在第一次出现时加下划线 */
export type TermScope = { seen: Set<string> };

export function termScope(): TermScope {
  return { seen: new Set() };
}

function withTerms(text: string, ix: Index, scope: TermScope, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  splitTerms(text, termMatcher(ix)).forEach((p, i) => {
    if (typeof p === "string") out.push(p);
    else if (scope.seen.has(p.term.id)) out.push(p.text);
    else {
      scope.seen.add(p.term.id);
      out.push(
        <Term key={`${key}t${i}`} t={termLite(ix, p.term)}>
          {p.text}
        </Term>,
      );
    }
  });
  return out;
}

/**
 * 把 [[kind:id|label]] 渲染为链接；解析不了的退化为纯文本。服务端、客户端都可用（无 hooks）。
 * 传入 terms 时，链接以外的文字里出现的基础词条会加下划线。
 */
export function renderWiki(text: string, ix: Index, terms?: TermScope): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  const plain = (s: string) => {
    if (terms) out.push(...withTerms(s, ix, terms, `p${i++}`));
    else out.push(s);
  };
  for (const m of text.matchAll(WIKI_RE)) {
    const start = m.index ?? 0;
    if (start > last) plain(text.slice(last, start));
    const target = wikiTarget(ix, m[1], m[2]);
    const label = m[3] ?? target?.label ?? m[2];
    out.push(
      target ? (
        <Link key={`w${i++}`} href={target.href} className="link">
          {label}
        </Link>
      ) : (
        <Fragment key={`w${i++}`}>{label}</Fragment>
      ),
    );
    last = start + m[0].length;
  }
  if (last < text.length) plain(text.slice(last));
  return out;
}

export function RichText({
  text,
  ix,
  className = "prose-cn",
  terms,
}: {
  text?: string;
  ix: Index;
  className?: string;
  terms?: TermScope;
}) {
  if (!text) return null;
  const paras = text.split(/\n{2,}/);
  return (
    <div className={className}>
      {paras.map((p, i) => (
        <p key={i}>{renderWiki(p.trim(), ix, terms)}</p>
      ))}
    </div>
  );
}

/** 行内版本：不包段落 */
export function InlineRich({ text, ix, terms }: { text?: string; ix: Index; terms?: TermScope }) {
  if (!text) return null;
  return <>{renderWiki(text, ix, terms)}</>;
}
