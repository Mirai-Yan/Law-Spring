import { describe, expect, it } from "vitest";
import { LINK_DASH, skyCss, STAR_STYLES } from "../src/lib/star-themes";
import { DARK_THEMES, THEMES } from "../src/lib/theme";

function lin(v: number) {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(lin);
}
function contrast(a: string, b: string) {
  const L = (h: string) => {
    const [r, g, bl] = rgb(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** OKLab 色差 ×100（与 validate_palette 的口径一致） */
function deltaE(a: string, b: string) {
  const ok = (h: string) => {
    const [r, g, bl] = rgb(h);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const [p, q] = [ok(a), ok(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
}

describe("繁星图的主题材质", () => {
  it("每套主题都有材质；深浅天空与界面主题一致", () => {
    for (const t of THEMES) {
      if (t.id === "system") continue;
      const s = STAR_STYLES[t.id];
      expect(s, t.id).toBeDefined();
      // 森林书院是浅色界面，但图谱面板是暮色林间
      if (t.id !== "green") expect(s.darkSky, t.id).toBe(DARK_THEMES.has(t.id));
      expect(s.bloom > 0, t.id).toBe(s.darkSky);
      expect(skyCss(s)).toContain(s.sky[1]);
    }
  });

  it("三个星座的颜色两两可分（正常视觉色差 ≥ 15）", () => {
    for (const [id, s] of Object.entries(STAR_STYLES)) {
      const g = Object.values(s.groups);
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) expect(deltaE(g[i], g[j]), `${id} ${g[i]} / ${g[j]}`).toBeGreaterThanOrEqual(15);
    }
  });

  it("标签对天空的对比度不低于 4.5", () => {
    for (const [id, s] of Object.entries(STAR_STYLES)) for (const sky of s.sky) expect(contrast(s.label, sky), `${id} ${s.label} / ${sky}`).toBeGreaterThanOrEqual(4.5);
  });

  it("磨砂玻璃需要填充色，星盘需要细线色，星云需要云色", () => {
    expect(STAR_STYLES.macaron.fills).toBeDefined();
    expect(STAR_STYLES.navy.brass).toBeDefined();
    expect(STAR_STYLES.dusk.nebula?.length).toBeGreaterThan(2);
  });

  it("每种关系类型都有线型；虚线类型之间互不相同", () => {
    const dashed = Object.values(LINK_DASH).filter((d) => d.length).map((d) => d.join(","));
    expect(new Set(dashed).size).toBe(dashed.length);
  });
});
