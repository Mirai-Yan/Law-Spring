/**
 * 繁星图的主题材质：每套界面主题对应一种「天空 + 星球材质 + 彗星」。
 * 只是数据，不依赖浏览器；绘制在 src/components/starfield/paint.ts。
 *
 * 三个星座的颜色对各自的天空用 validate_palette 校验过（全部两两比较，含色盲模拟），
 * 不取自主题色卡，以保证可分；标签色对天空的对比度不低于 4.5。
 */
import type { StarGroup, StarLinkType } from "./starmap";
import type { ResolvedTheme } from "./theme";

export type StarKind = "velvet" | "moon" | "instrument" | "bio" | "firefly" | "nebula" | "glass";
export type Atmos = "ruled" | "moon" | "astrolabe" | "abyss" | "forest" | "nebula" | "bokeh" | "frost";

export type StarStyle = {
  /** 材质名，显示在图例里 */
  name: string;
  kind: StarKind;
  atmos: Atmos;
  /** 天空是深色（发光叠加）还是浅色（正常叠加、带投影） */
  darkSky: boolean;
  /** 天空的径向渐变：中心、中段、边缘 */
  sky: readonly [string, string, string];
  groups: Readonly<Record<StarGroup, string>>;
  /** 磨砂玻璃珠的填充色（只有 glass 用） */
  fills?: Readonly<Record<StarGroup, string>>;
  comet: readonly string[];
  /** 发光星的星核颜色，缺省为白 */
  core?: string;
  /** 星盘细线的颜色 */
  brass?: string;
  /** 星云的颜色 */
  nebula?: readonly string[];
  label: string;
  /** 浅色天空上标签的描边色 */
  halo: string;
  constel: string;
  linkAlpha: number;
  /** 星座晕的透明度 */
  haze: number;
  /** 连线画成细藤（二次曲线） */
  vine?: boolean;
  /** 纸纹、阴影用的墨色与强调色 */
  ink: string;
  accent: string;
  /** 详情面板（玻璃质感） */
  panel: { bg: string; border: string; ink: string; ink2: string; link: string };
  /** 3D 模式的辉光强度；0 表示关闭辉光（浅色天空） */
  bloom: number;
};

const darkPanel = (link: string) => ({ bg: "rgb(8 12 22 / 0.62)", border: "rgb(255 255 255 / 0.14)", ink: "#f2f5f8", ink2: "rgb(242 245 248 / 0.66)", link });
const lightPanel = (ink: string, ink2: string, link: string) => ({ bg: "rgb(255 255 255 / 0.66)", border: "rgb(255 255 255 / 0.8)", ink, ink2, link });

export const STAR_STYLES: Record<ResolvedTheme, StarStyle> = {
  light: {
    name: "天鹅绒",
    kind: "velvet",
    atmos: "ruled",
    darkSky: false,
    sky: ["#fffaf2", "#fdf4e9", "#f1e1cc"],
    groups: { base: "#944561", theory: "#398ad6", sanction: "#c26e12" },
    comet: ["#ac5d64", "#854F6C"],
    label: "#2b172a",
    halo: "#fdf4e9",
    constel: "#854F6C",
    linkAlpha: 0.15,
    haze: 0.07,
    ink: "#2b172a",
    accent: "#ac5d64",
    panel: lightPanel("#2b172a", "#554454", "#9d5158"),
    bloom: 0,
  },
  dark: {
    name: "月光",
    kind: "moon",
    atmos: "moon",
    darkSky: true,
    sky: ["#14293a", "#08161e", "#03090d"],
    groups: { base: "#3096de", theory: "#c47d04", sanction: "#ae4974" },
    comet: ["#e2ebf0"],
    label: "#e2ebf0",
    halo: "#08161e",
    constel: "#9BA8AB",
    linkAlpha: 0.2,
    haze: 0.06,
    ink: "#e2ebf0",
    accent: "#CCD0CF",
    panel: darkPanel("#CCD0CF"),
    bloom: 0.55,
  },
  navy: {
    name: "星盘",
    kind: "instrument",
    atmos: "astrolabe",
    darkSky: true,
    sky: ["#0e2c60", "#051538", "#01081a"],
    groups: { base: "#4a8df5", theory: "#c67c0c", sanction: "#9f557f" },
    comet: ["#caf0ff"],
    brass: "#c2a46b",
    label: "#caf0ff",
    halo: "#051538",
    constel: "#7DA0CA",
    linkAlpha: 0.2,
    haze: 0.05,
    ink: "#caf0ff",
    accent: "#5d8cbd",
    panel: darkPanel("#9fc4d9"),
    bloom: 0.45,
  },
  teal: {
    name: "荧光",
    kind: "bio",
    atmos: "abyss",
    darkSky: true,
    sky: ["#0a3d44", "#03232a", "#000d10"],
    groups: { base: "#06a3a5", theory: "#0c71d1", sanction: "#c0401c" },
    comet: ["#6DA5C0", "#d5efff"],
    core: "#e6fdff",
    label: "#d5efff",
    halo: "#03232a",
    constel: "#6DA5C0",
    linkAlpha: 0.2,
    haze: 0.06,
    ink: "#d5efff",
    accent: "#26a1a7",
    panel: darkPanel("#6dd0d4"),
    bloom: 0.55,
  },
  green: {
    name: "萤火",
    kind: "firefly",
    atmos: "forest",
    darkSky: true,
    sky: ["#2d5c47", "#173f30", "#08190f"],
    groups: { base: "#979505", theory: "#2098db", sanction: "#b26385" },
    comet: ["#f4f3c6"],
    core: "#fffbe0",
    label: "#fbfada",
    halo: "#173f30",
    constel: "#ADBC9F",
    linkAlpha: 0.2,
    haze: 0.06,
    vine: true,
    ink: "#fbfada",
    accent: "#ADBC9F",
    panel: darkPanel("#d9e6b0"),
    bloom: 0.6,
  },
  dusk: {
    name: "星云",
    kind: "nebula",
    atmos: "nebula",
    darkSky: true,
    sky: ["#2b3060", "#151a3a", "#070a1c"],
    groups: { base: "#ba5a92", theory: "#4a8df5", sanction: "#e06526" },
    comet: ["#FFD0EC", "#c9b8ff"],
    core: "#ffe6f4",
    nebula: ["#474F7A", "#6B597F", "#81689D", "#FFD0EC", "#3F5B8D"],
    label: "#fdedf6",
    halo: "#151a3a",
    constel: "#FFD0EC",
    linkAlpha: 0.2,
    haze: 0.05,
    ink: "#fdedf6",
    accent: "#FFD0EC",
    panel: darkPanel("#ffd0ec"),
    bloom: 0.55,
  },
  sakura: {
    name: "樱绒",
    kind: "velvet",
    atmos: "bokeh",
    darkSky: false,
    sky: ["#fffbfd", "#fdf2f8", "#f2dceb"],
    groups: { base: "#90466e", theory: "#3685ea", sanction: "#c26e12" },
    comet: ["#81689d", "#c77d9c"],
    label: "#171c3b",
    halo: "#fdf2f8",
    constel: "#81689d",
    linkAlpha: 0.15,
    haze: 0.07,
    ink: "#171c3b",
    accent: "#81689d",
    panel: lightPanel("#171c3b", "#424965", "#796094"),
    bloom: 0,
  },
  macaron: {
    name: "磨砂玻璃",
    kind: "glass",
    atmos: "frost",
    darkSky: false,
    sky: ["#fafefc", "#eef9f4", "#d8ece3"],
    groups: { base: "#117faa", theory: "#c06a64", sanction: "#5c6c14" },
    fills: { base: "#99CDD8", theory: "#F3C3B2", sanction: "#CFD6C4" },
    comet: ["#7fb9c6", "#e09d86"],
    label: "#273329",
    halo: "#eef9f4",
    constel: "#626862",
    linkAlpha: 0.22,
    haze: 0.08,
    ink: "#273329",
    accent: "#2b7484",
    panel: lightPanel("#273329", "#454d45", "#2b7484"),
    bloom: 0,
  },
};

/** 容器的 CSS 背景（画布还没画出来时先显示） */
export function skyCss(s: StarStyle): string {
  return `radial-gradient(ellipse at 38% 28%, ${s.sky[0]} 0%, ${s.sky[1]} 55%, ${s.sky[2]} 100%)`;
}

/**
 * 关系类型靠线型区分（连线颜色随两端星座渐变），图例画同样的线型。
 * 先决关系与属种、构成、派生用实线；功能对应虚线，对称点线，对立点划线，继受长虚线。
 */
export const LINK_DASH: Record<StarLinkType, readonly number[]> = {
  prereq: [],
  is_a: [],
  part_of: [],
  derived_from: [],
  functional_equivalent: [4, 3],
  symmetric: [1, 3],
  opposes: [6, 2, 1, 2],
  transplanted_to: [9, 4],
};
