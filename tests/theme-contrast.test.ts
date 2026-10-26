import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES } from "../src/lib/theme";

/** 从 globals.css 读出每套主题的令牌，逐对核对文字与背景的对比度 */

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const css = readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");
const blocks = new Map<string, Record<string, string>>();
for (const m of css.matchAll(/^:root(?:\[data-theme="([a-z]+)"\])?\s*\{([^}]*)\}/gm)) {
  const vars: Record<string, string> = {};
  for (const v of m[2].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[v[1]] = v[2].toLowerCase();
  if (vars.bg) blocks.set(m[1] ?? "light", vars);
}

describe("主题令牌的对比度", () => {
  it("8 套主题都定义了令牌", () => {
    for (const t of THEMES) if (t.id !== "system") expect(blocks.has(t.id), t.id).toBe(true);
  });

  for (const [id, v] of blocks) {
    it(`${id}：文字三级、按钮、标签、状态徽章都达标`, () => {
      const pairs: [string, string, string, number][] = [];
      for (const bg of ["bg", "surface", "surface-2", "surface-3"]) {
        pairs.push(["ink", "ink", bg, 12], ["ink-2", "ink-2", bg, 7], ["ink-3", "ink-3", bg, 4.5]);
      }
      pairs.push(
        ["主按钮（上）", "primary-ink", "primary-top", 4.5],
        ["主按钮（下）", "primary-ink", "primary-bottom", 4.5],
        ["强调小字", "accent-ink", "bg", 4.5],
        ["强调小字 / 浅强调底", "accent-ink", "accent-soft", 4.5],
        ["次级强调标签", "accent-2-ink", "accent-2-soft", 4.5],
        ["待核实", "status-warning", "status-warning-soft", 4.5],
        ["已核实", "status-good", "status-good-soft", 4.5],
        ["存疑", "status-serious", "status-serious-soft", 4.5],
      );
      for (const [label, fg, bg, min] of pairs) {
        expect(v[fg], `${id} 缺少 --${fg}`).toBeDefined();
        expect(v[bg], `${id} 缺少 --${bg}`).toBeDefined();
        expect(contrast(v[fg], v[bg]), `${id} ${label}：--${fg} / --${bg}`).toBeGreaterThanOrEqual(min);
      }
    });
  }
});
