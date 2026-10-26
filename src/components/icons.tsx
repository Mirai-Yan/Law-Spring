import type { SVGProps } from "react";

/**
 * 界面用的线条图标：24 网格、线宽 1.5、圆角端点，风格一致；替代 ★ ✓ ● ⚠ ✦ 等符号字符。
 * 默认 aria-hidden，图标旁边总有文字；单独使用时请传 aria-label 并去掉 aria-hidden。
 */
type P = SVGProps<SVGSVGElement> & { size?: number; filled?: boolean };

function Base({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="inline-block shrink-0 align-[-0.15em]"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 根据论、奇点 */
export function IconStar({ filled, ...p }: P) {
  return (
    <Base {...p}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill={filled ? "currentColor" : "none"} />
    </Base>
  );
}

export function IconCheck(p: P) {
  return (
    <Base {...p}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Base>
  );
}

/** 已核实 */
export function IconCheckCircle(p: P) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </Base>
  );
}

/** 待核实 */
export function IconClock(p: P) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Base>
  );
}

/** 存疑、警告 */
export function IconAlert(p: P) {
  return (
    <Base {...p}>
      <path d="M12 3.5l9 15.5H3z" />
      <path d="M12 10v4M12 16.8v.2" />
    </Base>
  );
}

export function IconX(p: P) {
  return (
    <Base {...p}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Base>
  );
}

/** AI 生成的内容 */
export function IconSparkle(p: P) {
  return (
    <Base {...p}>
      <path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z" />
      <path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z" />
    </Base>
  );
}

export function IconBookmark({ filled, ...p }: P) {
  return (
    <Base {...p}>
      <path d="M18 20.5l-6-3.5-6 3.5V5.5A2 2 0 0 1 8 3.5h8a2 2 0 0 1 2 2z" fill={filled ? "currentColor" : "none"} />
    </Base>
  );
}

/** 发送 */
export function IconSend(p: P) {
  return (
    <Base {...p}>
      <path d="M12 19.5V5M5.5 11.5L12 5l6.5 6.5" />
    </Base>
  );
}

/** 展开 / 收起 */
export function IconChevron({ open, ...p }: P & { open?: boolean }) {
  return (
    <Base {...p}>
      <path d={open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </Base>
  );
}

/** 修改 */
export function IconPencil(p: P) {
  return (
    <Base {...p}>
      <path d="M14.5 5.5l4 4M4.5 19.5l1-4.5L16 4.5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L9 18.5z" />
    </Base>
  );
}

/** 删除 */
export function IconTrash(p: P) {
  return (
    <Base {...p}>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10.5 11v5M13.5 11v5" />
    </Base>
  );
}

/** 添加 */
export function IconPlus(p: P) {
  return (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}
