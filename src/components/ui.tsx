import Link from "next/link";
import type { ReactNode } from "react";
import { LEVEL_LABEL, PREREQ_KIND_LABEL, type PrereqKind, type QuestionLevel, type Status } from "@/lib/schema";
import { IconAlert, IconCheckCircle, IconClock, IconSparkle, IconStar } from "./icons";

/* ---------------- 审核状态 ---------------- */

type Claimish = { status?: Status; needsSource?: boolean; origin?: "human" | "ai" };

export function StatusBadge({ item, compact = false }: { item: Claimish; compact?: boolean }) {
  const badges: ReactNode[] = [];
  if (item.origin === "ai")
    badges.push(
      <span key="ai" className="chip" style={{ borderColor: "var(--accent)", color: "var(--accent-ink)" }}>
        <IconSparkle size={13} />
        AI 推测·未入库
      </span>,
    );
  if (item.status === "verified")
    badges.push(
      <span key="v" className="chip" style={{ background: "var(--status-good-soft)", borderColor: "transparent", color: "var(--status-good)" }}>
        <IconCheckCircle size={13} />
        {!compact && "已核实"}
        {compact && <span className="sr-only">已核实</span>}
      </span>,
    );
  else if (item.status === "disputed")
    badges.push(
      <span key="d" className="chip" style={{ background: "var(--status-serious-soft)", borderColor: "transparent", color: "var(--status-serious)" }}>
        <IconAlert size={13} />
        存疑
      </span>,
    );
  else
    badges.push(
      <span key="draft" className="chip" title="AI 起草，尚未核对原文" style={{ background: "var(--status-warning-soft)", borderColor: "transparent", color: "var(--status-warning)" }}>
        <IconClock size={13} />
        待核实
      </span>,
    );
  if (item.needsSource)
    badges.push(
      <span key="ns" className="chip" title="年份、卷期、出处或立场归属没有把握">
        <span aria-hidden>?</span>
        缺出处
      </span>,
    );
  return <span className="inline-flex flex-wrap gap-1 align-middle">{badges}</span>;
}

/* ---------------- 法域 ---------------- */

export function jurColor(id: string) {
  return `var(--jur-${id})`;
}

export function JurDot({ id, size = 8 }: { id: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: jurColor(id) }}
    />
  );
}

export function JurChip({ id, label, href = true }: { id: string; label: string; href?: boolean }) {
  const inner = (
    <span className="chip">
      <JurDot id={id} />
      {label}
    </span>
  );
  return href ? <Link href={`/jurisdiction/${id}/`}>{inner}</Link> : inner;
}

/* ---------------- 问题层级与先决类型 ---------------- */

export function LevelBadge({ level }: { level: QuestionLevel }) {
  if (level === "foundation")
    return (
      <span className="chip" style={{ background: "var(--accent-soft)", borderColor: "transparent", color: "var(--accent-ink)" }}>
        <IconStar size={13} filled />
        根据论
      </span>
    );
  return <span className="chip">{LEVEL_LABEL[level]}</span>;
}

const KIND_GLYPH: Record<PrereqKind, string> = {
  foundational: "◆",
  logical: "→",
  systematic: "▤",
  conceptual: "≡",
};

export function KindChip({ kind }: { kind: PrereqKind }) {
  return (
    <span className="chip" style={{ background: "var(--surface-2)", borderColor: "transparent" }}>
      <span aria-hidden>{KIND_GLYPH[kind]}</span>
      {PREREQ_KIND_LABEL[kind]}
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="section-title">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-ink-3">{sub}</p>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
      <h1 className="font-serif text-2xl font-bold leading-snug sm:text-3xl">{title}</h1>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-ink-3">{children}</p>;
}
