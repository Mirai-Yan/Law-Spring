import { describe, expect, it } from "vitest";
import { DARK_THEMES, isThemePref, normalizeThemePref, resolveTheme, THEME_BOOT_SCRIPT, THEME_COLOR, THEMES } from "../src/lib/theme";

describe("主题", () => {
  it("8 套主题加「跟随系统」", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["system", "light", "green", "sakura", "macaron", "dark", "navy", "teal", "dusk"]);
    for (const t of THEMES) expect(t.ramp).toHaveLength(5);
  });

  it("跟随系统时按系统深浅色解析，其余主题原样返回", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("green", true)).toBe("green");
    expect(resolveTheme("dusk", false)).toBe("dusk");
  });

  it("只接受已定义的主题名；旧的「羊皮纸」迁移为法典·米红", () => {
    expect(isThemePref("navy")).toBe(true);
    expect(isThemePref("sepia")).toBe(false);
    expect(normalizeThemePref("sepia")).toBe("light");
    expect(normalizeThemePref("neon")).toBe("system");
    expect(normalizeThemePref(null)).toBe("system");
    expect(normalizeThemePref("macaron")).toBe("macaron");
  });

  it("每个具体主题都有地址栏颜色；深色主题与色阶条一致", () => {
    for (const t of THEMES) {
      if (t.id === "system") continue;
      expect(THEME_COLOR[t.id]).toMatch(/^#[0-9a-f]{6}$/);
      expect(DARK_THEMES.has(t.id)).toBe(t.tone === "dark");
      expect(t.ramp[0].toLowerCase()).toBe(THEME_COLOR[t.id]);
    }
  });

  it("启动脚本能执行，并把保存的主题写到 html 上", () => {
    const run = (stored: string | null, systemDark: boolean) => {
      const dataset: Record<string, string> = {};
      const env = {
        localStorage: { getItem: () => stored },
        matchMedia: () => ({ matches: systemDark }),
        document: { documentElement: { dataset } },
      };
      new Function("localStorage", "matchMedia", "document", THEME_BOOT_SCRIPT)(env.localStorage, env.matchMedia, env.document);
      return dataset;
    };
    expect(run("green", false)).toEqual({ theme: "green", themePref: "green" });
    expect(run("sepia", true)).toEqual({ theme: "light", themePref: "light" });
    expect(run(null, true)).toEqual({ theme: "dark", themePref: "system" });
    expect(run("bogus", false)).toEqual({ theme: "light", themePref: "system" });
  });
});
