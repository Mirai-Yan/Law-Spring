/** 界面主题：选择保存在本机（登录后另随账号同步），解析后写到 <html data-theme> */

/** 每套主题的色阶条（页面底、侧栏、主强调、次级强调、主文字），用于主题菜单的预览 */
export const THEMES = [
  { id: "system", label: "跟随系统", tone: "auto", ramp: ["#fdf4e9", "#ac5d64", "#132129", "#CCD0CF", "#051016"] },
  { id: "light", label: "法典·米红", tone: "light", ramp: ["#fdf4e9", "#faecdb", "#ac5d64", "#854F6C", "#2b172a"] },
  { id: "green", label: "森林书院", tone: "light", ramp: ["#f1f8ee", "#e9f2e5", "#436850", "#ADBC9F", "#04261b"] },
  { id: "sakura", label: "樱粉", tone: "light", ramp: ["#fdf2f8", "#f7eaf2", "#81689d", "#A2869C", "#171c3b"] },
  { id: "macaron", label: "马卡龙", tone: "light", ramp: ["#eef9f4", "#e4f2ec", "#99CDD8", "#F3C3B2", "#1e291f"] },
  { id: "dark", label: "月曜", tone: "dark", ramp: ["#051016", "#132129", "#CCD0CF", "#9BA8AB", "#e2ebf0"] },
  { id: "navy", label: "深蓝·经典", tone: "dark", ramp: ["#010e29", "#0b1f3f", "#5d8cbd", "#7DA0CA", "#caf0ff"] },
  { id: "teal", label: "深海·青蓝", tone: "dark", ramp: ["#001317", "#00252a", "#0C7075", "#6DA5C0", "#d5efff"] },
  { id: "dusk", label: "暮光星云", tone: "dark", ramp: ["#0d112a", "#1d2340", "#80679c", "#A2869C", "#fdedf6"] },
] as const;

export type ThemePref = (typeof THEMES)[number]["id"];
export type ResolvedTheme = Exclude<ThemePref, "system">;

export const THEME_KEY = "fm-theme";
export const THEME_EVENT = "fm:themechange";

/** 深色底的主题：决定 color-scheme、星图与 3D 的发光方式 */
export const DARK_THEMES: ReadonlySet<ResolvedTheme> = new Set(["dark", "navy", "teal", "dusk"]);

/** 浏览器地址栏等系统界面的颜色，与各主题的 --bg 一致 */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#fdf4e9",
  dark: "#051016",
  navy: "#010e29",
  teal: "#001317",
  green: "#f1f8ee",
  dusk: "#0d112a",
  sakura: "#fdf2f8",
  macaron: "#eef9f4",
};

/** 已删除的旧主题：「羊皮纸」由法典·米红取代 */
const LEGACY: Record<string, ThemePref> = { sepia: "light" };

export function isThemePref(v: unknown): v is ThemePref {
  return THEMES.some((t) => t.id === v);
}

/** 读到的主题名：旧名迁移成新名，无法识别的回到「跟随系统」 */
export function normalizeThemePref(v: unknown): ThemePref {
  if (typeof v === "string" && v in LEGACY) return LEGACY[v];
  return isThemePref(v) ? v : "system";
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/**
 * 放进 <head> 的内联脚本：在首次绘制前设好主题，避免闪烁。
 * 必须自成一体（不能引用本模块的其他导出），所以常量直接写进字符串。
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});var L=${JSON.stringify(LEGACY)};if(L[p])p=L[p];if(${JSON.stringify(
  THEMES.map((t) => t.id),
)}.indexOf(p)<0)p="system";var t=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;var d=document.documentElement;d.dataset.theme=t;d.dataset.themePref=p;}catch(e){}})();`;
