/**
 * 繁星图的绘制引擎（2D canvas，供 force-graph 的各个绘制回调调用）。
 *
 * - 天空：底色渐变 + 主题氛围（法典纸横线、星盘、焦散、林影、星云、光斑、雾面）+ 远近两层星尘；画在背景画布上。
 * - 星球：按「主题 × 星座 × 半径 × 分辨率」缓存成贴图，每帧只贴图并叠少量动态细节（衍射光芒、刻度环、外膜）。
 * - 连线：两端星座色渐变的细线，关系类型靠线型区分；光点是带尾迹的彗星。
 * - 聚焦：无关的星与线约 140ms 渐暗；标签按「下、右、左、上」寻找不重叠的位置。
 */
import { LINK_DASH, type StarStyle } from "@/lib/star-themes";
import type { SL, SN } from "../starmap-shared";

type Sprite = { c: HTMLCanvasElement; half: number };

export type Painter = {
  cache: Map<string, Sprite>;
  nodeAlpha: Map<string, number>;
  linkAlpha: Map<SL, number>;
  theme: string;
};

export function createPainter(theme: string): Painter {
  return { cache: new Map(), nodeAlpha: new Map(), linkAlpha: new Map(), theme };
}

/** 换主题时丢掉旧贴图 */
export function setPainterTheme(p: Painter, theme: string) {
  if (p.theme === theme) return;
  p.cache.clear();
  p.theme = theme;
}

/* ---------------- 工具 ---------------- */

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
function rng(seed: number) {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
export function hexA(hex: string, a: number) {
  return `rgba(${rgb(hex)},${a})`;
}
export function mix(h1: string, h2: string, t: number) {
  const a = parseInt(h1.slice(1), 16);
  const b = parseInt(h2.slice(1), 16);
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return "#" + [16, 8, 0].map((s) => c(s).toString(16).padStart(2, "0")).join("");
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
/** 柔和的径向光斑 */
function soft(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number) {
  if (r <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, hexA(col, a));
  gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/* ---------------- 天空 ---------------- */

/** 把整张背景画布画成天空；坐标按 1000×560 的虚拟画幅等比放大，铺满画布 */
export function paintSky(cv: HTMLCanvasElement, s: StarStyle, seed: string) {
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const base = g.createRadialGradient(w * 0.38, h * 0.28, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  base.addColorStop(0, s.sky[0]);
  base.addColorStop(0.55, s.sky[1]);
  base.addColorStop(1, s.sky[2]);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // 1000×560 的虚拟画幅，居中铺满
  const k = Math.max(w / 1000, h / 560);
  g.translate((w - 1000 * k) / 2, (h - 560 * k) / 2);
  g.scale(k, k);
  const R = rng(hash(seed + s.name));
  atmosphere(g, s, R);
  dust(g, s, R);
  // 暗角
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, s.darkSky ? "rgba(0,0,0,.42)" : hexA(s.ink, 0.06));
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

function atmosphere(g: CanvasRenderingContext2D, s: StarStyle, R: () => number) {
  switch (s.atmos) {
    case "ruled": {
      g.strokeStyle = hexA(s.ink, 0.045);
      g.lineWidth = 0.6;
      for (let y = 34; y < 560; y += 26) {
        g.beginPath();
        g.moveTo(-200, y);
        g.lineTo(1200, y);
        g.stroke();
      }
      g.strokeStyle = hexA(s.accent, 0.16);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(66, -100);
      g.lineTo(66, 700);
      g.stroke();
      for (let i = 0; i < 3800; i++) {
        g.fillStyle = hexA(s.ink, 0.012 + R() * 0.03);
        g.fillRect(R() * 1000, R() * 560, 0.6, 0.6);
      }
      break;
    }
    case "moon":
      soft(g, 860, 60, 320, "#cfe0ea", 0.1);
      break;
    case "astrolabe": {
      const cx = 560;
      const cy = 290;
      const brass = s.brass ?? "#c2a46b";
      g.strokeStyle = hexA(brass, 0.1);
      g.lineWidth = 0.6;
      for (let r = 90; r < 760; r += 72) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = hexA(brass, 0.07);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 90, cy + Math.sin(a) * 90);
        g.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900);
        g.stroke();
      }
      g.strokeStyle = hexA(brass, 0.16);
      for (let i = 0; i < 240; i++) {
        const a = (i / 240) * Math.PI * 2;
        const r1 = i % 10 === 0 ? 538 : i % 5 === 0 ? 532 : 527;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 522, cy + Math.sin(a) * 522);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        g.stroke();
      }
      break;
    }
    case "abyss":
      for (let i = 0; i < 6; i++) {
        const x0 = 80 + R() * 840;
        const w0 = 20 + R() * 50;
        const sk = 120 + R() * 140;
        const gr = g.createLinearGradient(0, 0, 0, 560);
        gr.addColorStop(0, "rgba(160,225,235,.07)");
        gr.addColorStop(1, "rgba(160,225,235,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x0, -40);
        g.lineTo(x0 + w0, -40);
        g.lineTo(x0 + w0 + sk, 600);
        g.lineTo(x0 + sk - w0, 600);
        g.closePath();
        g.fill();
      }
      break;
    case "forest": {
      soft(g, 850, 70, 260, "#fbfada", 0.12);
      for (let i = 0; i < 70; i++) {
        const x = R() < 0.5 ? R() * 220 : 780 + R() * 220;
        soft(g, x, R() * 560, 30 + R() * 90, R() < 0.5 ? "#0b2116" : "#1e4a31", 0.35 + R() * 0.3);
      }
      for (let i = 0; i < 40; i++) soft(g, R() * 1000, 470 + R() * 120, 40 + R() * 80, "#06140c", 0.5);
      const mist = g.createLinearGradient(0, 360, 0, 470);
      mist.addColorStop(0, "rgba(173,188,159,0)");
      mist.addColorStop(0.5, "rgba(173,188,159,.06)");
      mist.addColorStop(1, "rgba(173,188,159,0)");
      g.fillStyle = mist;
      g.fillRect(-200, 360, 1400, 110);
      break;
    }
    case "nebula": {
      const cols = s.nebula ?? ["#474F7A"];
      g.globalCompositeOperation = "lighter";
      const bands: [number, number, number, number][] = [
        [120, 420, 880, 140],
        [80, 120, 760, 470],
        [300, 520, 980, 260],
      ];
      bands.forEach(([x0, y0, x1, y1], b) => {
        for (let i = 0; i < 160; i++) {
          const u = R();
          soft(g, x0 + (x1 - x0) * u + (R() - 0.5) * 140, y0 + (y1 - y0) * u + (R() - 0.5) * 120, 18 + R() * 70, cols[(b + i) % cols.length], 0.035 + R() * 0.04);
        }
      });
      g.globalCompositeOperation = "source-over";
      break;
    }
    case "bokeh":
      for (let i = 0; i < 26; i++) soft(g, R() * 1000, R() * 560, 24 + R() * 90, R() < 0.5 ? "#ffc9e4" : "#e8d6f5", 0.18 + R() * 0.16);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = hexA(s.ink, 0.01 + R() * 0.02);
        g.fillRect(R() * 1000, R() * 560, 0.6, 0.6);
      }
      break;
    case "frost":
      for (let i = 0; i < 22; i++) soft(g, R() * 1000, R() * 560, 80 + R() * 160, "#ffffff", 0.22 + R() * 0.2);
      g.fillStyle = hexA(s.ink, 0.07);
      for (let x = -180; x < 1180; x += 24) for (let y = -100; y < 660; y += 24) g.fillRect(x, y, 0.8, 0.8);
      break;
  }
}

/** 远近两层星尘：远层更多、更暗、更小 */
function dust(g: CanvasRenderingContext2D, s: StarStyle, R: () => number) {
  const tints = s.darkSky
    ? s.kind === "nebula"
      ? ["#ffffff", "#ffd6ee", "#cfd6ff"]
      : s.kind === "firefly"
        ? ["#f4f3c6", "#dfe9c0"]
        : ["#ffffff", "#d6e4ff", "#c9e8f2"]
    : [s.ink, s.constel];
  if (s.darkSky) g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 1100; i++) {
    const near = i % 7 === 0;
    const x = -200 + R() * 1400;
    const y = -100 + R() * 760;
    const r = near ? 0.6 + R() * 1.0 : 0.35 + R() * 0.55;
    const a = s.darkSky ? (near ? 0.45 + R() * 0.45 : 0.18 + R() * 0.4) : near ? 0.08 + R() * 0.1 : 0.05 + R() * 0.08;
    const col = tints[Math.floor(R() * tints.length)];
    if (near) soft(g, x, y, r * 3, col, a * 0.55);
    g.fillStyle = hexA(col, a);
    g.beginPath();
    g.arc(x, y, near ? r * 0.6 : r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
}

/* ---------------- 聚焦渐变 ---------------- */

/** 每帧调用：无关的星与线渐暗，相连的提亮（约 140ms） */
export function updateFocus(p: Painter, nodes: SN[], links: SL[], focus: string | null, near: Set<string> | null, dt: number, reduced: boolean) {
  const k = reduced ? 1 : Math.min(1, dt / 140);
  for (const n of nodes) {
    const target = !focus || n.id === focus || near?.has(n.id) ? 1 : 0.1;
    const cur = p.nodeAlpha.get(n.id) ?? 1;
    p.nodeAlpha.set(n.id, cur + (target - cur) * k);
  }
  for (const l of links) {
    const a = l.source as SN;
    const b = l.target as SN;
    const touches = !!focus && (a.id === focus || b.id === focus);
    const target = !focus ? 1 : touches ? 2.6 : 0.15;
    const cur = p.linkAlpha.get(l) ?? 1;
    p.linkAlpha.set(l, cur + (target - cur) * k);
  }
}

/* ---------------- 星座晕与星座名 ---------------- */

export function drawHaze(ctx: CanvasRenderingContext2D, nodes: SN[], s: StarStyle) {
  ctx.save();
  if (s.darkSky) ctx.globalCompositeOperation = "lighter";
  for (const n of nodes) if (n.x != null && n.y != null) soft(ctx, n.x, n.y, 40 + n.r * 5, s.groups[n.group], s.darkSky ? s.haze * 0.9 : s.haze);
  ctx.restore();
}

export function drawConstellationName(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, s: StarStyle) {
  ctx.save();
  ctx.font = `500 ${13 / Math.max(scale, 0.6)}px "Songti SC","Noto Serif SC",serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = hexA(s.constel, s.darkSky ? 0.5 : 0.62);
  ctx.fillText(text.length <= 8 ? text.split("").join(" ") : text, x, y);
  ctx.restore();
}

/* ---------------- 星球贴图 ---------------- */

function sprite(p: Painter, s: StarStyle, group: SN["group"], r0: number, res: number): Sprite {
  const rb = Math.round(Math.max(r0, 3) * 2) / 2;
  const K = s.kind === "velvet" ? 3.2 : s.kind === "glass" ? 2.4 : 5;
  const half = rb * K;
  const sc = Math.max(1, Math.min(res, Math.floor(1024 / (half * 2))));
  const key = `${group}:${rb}:${sc}`;
  const hit = p.cache.get(key);
  if (hit) return hit;
  const c = canvas(half * 2 * sc, half * 2 * sc);
  const g = c.getContext("2d")!;
  g.scale(sc, sc);
  g.translate(half, half);
  const col = s.groups[group];
  const R = rng(hash(key + s.name));
  const r = rb;
  if (s.kind === "velvet") {
    const rr = r * 1.12 + 1.2;
    g.save();
    g.translate(0, rr * 0.75);
    g.scale(1, 0.38);
    soft(g, 0, 0, rr * 1.35, s.ink, 0.16);
    g.restore();
    soft(g, 0, 0, rr * 2.9, col, 0.2);
    g.lineCap = "round";
    const N = Math.round(160 + rr * 26);
    for (let i = 0; i < N; i++) {
      const a = R() * Math.PI * 2;
      const r1 = rr * (0.62 + R() * 0.3);
      const len = rr * (0.22 + R() * 0.42);
      const bend = (R() - 0.5) * 0.7;
      g.strokeStyle = hexA(mix(col, "#ffffff", 0.3 + R() * 0.45), 0.12 + R() * 0.2);
      g.lineWidth = 0.25 + R() * 0.32;
      g.beginPath();
      g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.quadraticCurveTo(Math.cos(a + bend * 0.4) * (r1 + len * 0.6), Math.sin(a + bend * 0.4) * (r1 + len * 0.6), Math.cos(a + bend) * (r1 + len), Math.sin(a + bend) * (r1 + len));
      g.stroke();
    }
    const body = g.createRadialGradient(-rr * 0.34, -rr * 0.38, rr * 0.05, 0, 0, rr);
    body.addColorStop(0, hexA(mix(col, "#ffffff", 0.8), 0.98));
    body.addColorStop(0.5, hexA(mix(col, "#ffffff", 0.28), 0.95));
    body.addColorStop(1, hexA(mix(col, s.ink, 0.12), 0.9));
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, rr, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < Math.round(60 + rr * 10); i++) {
      const a = R() * Math.PI * 2;
      const r1 = rr * (0.86 + R() * 0.12);
      const len = rr * (0.08 + R() * 0.16);
      g.strokeStyle = hexA(mix(col, "#ffffff", 0.55), 0.18 + R() * 0.2);
      g.lineWidth = 0.18 + R() * 0.2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.lineTo(Math.cos(a) * (r1 + len), Math.sin(a) * (r1 + len));
      g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,.35)";
    g.lineWidth = Math.max(0.5, rr * 0.06);
    g.beginPath();
    g.arc(0, 0, rr * 0.93, 0.15, 1.35);
    g.stroke();
  } else if (s.kind === "glass") {
    const rr = r * 1.15 + 2;
    const fill = s.fills?.[group] ?? col;
    g.save();
    g.translate(rr * 0.15, rr * 0.85);
    g.scale(1, 0.34);
    soft(g, 0, 0, rr * 1.3, col, 0.22);
    g.restore();
    const body = g.createRadialGradient(-rr * 0.3, -rr * 0.35, rr * 0.05, 0, 0, rr);
    body.addColorStop(0, hexA(mix(fill, "#ffffff", 0.7), 0.72));
    body.addColorStop(0.65, hexA(fill, 0.5));
    body.addColorStop(1, hexA(mix(fill, col, 0.3), 0.62));
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, rr, 0, Math.PI * 2);
    g.fill();
    const cres = g.createRadialGradient(rr * 0.35, rr * 0.4, rr * 0.1, rr * 0.2, rr * 0.25, rr * 0.95);
    cres.addColorStop(0, hexA(col, 0.22));
    cres.addColorStop(1, hexA(col, 0));
    g.fillStyle = cres;
    g.beginPath();
    g.arc(0, 0, rr, 0, Math.PI * 2);
    g.fill();
    soft(g, -rr * 0.38, -rr * 0.42, rr * 0.42, "#ffffff", 0.7);
    soft(g, rr * 0.42, rr * 0.48, rr * 0.18, "#ffffff", 0.45);
    g.strokeStyle = hexA(col, 0.72);
    g.lineWidth = Math.max(0.7, rr * 0.07);
    g.beginPath();
    g.arc(0, 0, rr - 0.4, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,.75)";
    g.lineWidth = Math.max(0.5, rr * 0.05);
    g.beginPath();
    g.arc(0, 0, rr * 0.86, 3.6, 4.9);
    g.stroke();
  } else {
    const core = s.core ?? "#ffffff";
    const bloomA = s.kind === "instrument" ? 0.16 : s.kind === "firefly" ? 0.32 : 0.24;
    soft(g, 0, 0, r * 5, col, bloomA * 0.55);
    soft(g, 0, 0, r * 2.4, col, bloomA * 1.4);
    soft(g, 0, 0, r * 1.6, mix(col, "#ffffff", 0.6), 0.35);
    const cr = s.kind === "instrument" ? r * 0.5 : s.kind === "bio" ? r * 0.62 : r * 0.72;
    const cg = g.createRadialGradient(-cr * 0.2, -cr * 0.2, 0, 0, 0, cr);
    cg.addColorStop(0, hexA(core, 1));
    cg.addColorStop(0.55, hexA(mix(col, core, 0.55), 0.95));
    cg.addColorStop(1, hexA(col, 0));
    g.fillStyle = cg;
    g.beginPath();
    g.arc(0, 0, cr, 0, Math.PI * 2);
    g.fill();
  }
  const out = { c, half };
  p.cache.set(key, out);
  return out;
}

/** 3D 模式复用同一张贴图 */
export function spriteCanvas(p: Painter, s: StarStyle, n: Pick<SN, "group" | "r">, res = 4) {
  return sprite(p, s, n.group, n.r, res);
}

/* ---------------- 每帧：星、线、标签 ---------------- */

export function drawStar(ctx: CanvasRenderingContext2D, n: SN, s: StarStyle, p: Painter, t: number, scale: number, focused: boolean, reduced: boolean) {
  if (n.x == null || n.y == null) return;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const res = 2 ** Math.min(3, Math.max(0, Math.ceil(Math.log2(Math.max(1, scale * dpr)))));
  const sp = sprite(p, s, n.group, n.r, res);
  let x = n.x;
  let y = n.y;
  let tw = 1;
  const seed = hash(n.id);
  if (!reduced) {
    if (s.kind === "firefly") {
      x += 1.4 * Math.sin(t / 1400 + seed * 40);
      y += 1.1 * Math.cos(t / 1800 + seed * 30);
      tw = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(t / (520 + seed * 700) + seed * 50));
    } else if (s.kind === "glass") y += 1.6 * Math.sin(t / 1300 + seed * 25);
    else if (s.darkSky) tw = 0.97 + 0.03 * Math.sin(t / (900 + seed * 800) + seed * 30);
  }
  const A = p.nodeAlpha.get(n.id) ?? 1;
  const r = Math.max(n.r, 3);
  const lw = 1 / scale;
  ctx.save();
  ctx.globalAlpha = A * tw;
  if (s.darkSky) ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(sp.c, x - sp.half, y - sp.half, sp.half * 2, sp.half * 2);

  if (n.foundation) {
    if (s.darkSky) {
      const L = r * (s.kind === "instrument" ? 3 : 4.6);
      const angs = s.kind === "nebula" ? [0, Math.PI / 3, (2 * Math.PI) / 3] : [0, Math.PI / 2];
      for (const a of angs) {
        const gx = Math.cos(a) * L;
        const gy = Math.sin(a) * L;
        const sg = ctx.createLinearGradient(x - gx, y - gy, x + gx, y + gy);
        sg.addColorStop(0, "rgba(255,255,255,0)");
        sg.addColorStop(0.5, "rgba(255,255,255,.55)");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 0.8 * lw;
        ctx.beginPath();
        ctx.moveTo(x - gx, y - gy);
        ctx.lineTo(x + gx, y + gy);
        ctx.stroke();
      }
      if (s.kind === "moon") {
        ctx.strokeStyle = "rgba(220,232,240,.12)";
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(x, y, r * 3.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = hexA(s.groups[n.group], 0.4);
      ctx.lineWidth = 0.8 * lw;
      ctx.setLineDash([2 * lw, 3 * lw]);
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (s.kind === "instrument") {
    const rr = r * 1.35 + 2;
    const rot = (reduced ? 0 : t / 12000) + seed * 6;
    ctx.strokeStyle = hexA(s.brass ?? "#c2a46b", 0.55);
    ctx.lineWidth = 0.7 * lw;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.stroke();
    for (let q = 0; q < 12; q++) {
      const a = rot + (q * Math.PI * 2) / 12;
      const l2 = q % 3 === 0 ? 3.2 : 1.6;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      ctx.lineTo(x + Math.cos(a) * (rr + l2), y + Math.sin(a) * (rr + l2));
      ctx.stroke();
    }
  }
  if (s.kind === "bio") {
    const br = 1 + (reduced ? 0 : 0.08 * Math.sin(t / 1000 + seed * 20));
    ctx.strokeStyle = hexA(mix(s.groups[n.group], "#d5efff", 0.5), 0.45);
    ctx.lineWidth = 0.8 * lw;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.45 * br, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  if (n.tradition === "common") {
    ctx.strokeStyle = s.darkSky ? "rgba(190,220,255,.6)" : hexA(s.ink, 0.45);
    ctx.lineWidth = 0.8 * lw;
    ctx.setLineDash([2 * lw, 2 * lw]);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.8 + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (focused) {
    const rot = reduced ? 0 : t / 2600;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = s.darkSky ? "rgba(255,255,255,.85)" : hexA(s.ink, 0.7);
    ctx.lineWidth = 1.1 * lw;
    const rr = r * 2.2 + 7;
    ctx.beginPath();
    ctx.arc(x, y, rr, rot, rot + 4.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, rr, rot + 5.0, rot + 5.9);
    ctx.stroke();
  }
  ctx.restore();
}

function ctrl(a: SN, b: SN, seed: number): [number, number] {
  const dx = b.x! - a.x!;
  const dy = b.y! - a.y!;
  const len = Math.hypot(dx, dy) || 1;
  const q = (seed - 0.5) * 0.45 * len;
  return [(a.x! + b.x!) / 2 - (dy / len) * q, (a.y! + b.y!) / 2 + (dx / len) * q];
}
function at(a: SN, b: SN, u: number, vine: boolean, seed: number): [number, number] {
  if (!vine) return [a.x! + (b.x! - a.x!) * u, a.y! + (b.y! - a.y!) * u];
  const [cx, cy] = ctrl(a, b, seed);
  const v = 1 - u;
  return [v * v * a.x! + 2 * v * u * cx + u * u * b.x!, v * v * a.y! + 2 * v * u * cy + u * u * b.y!];
}

export function drawLink(ctx: CanvasRenderingContext2D, l: SL, s: StarStyle, p: Painter, t: number, scale: number, reduced: boolean) {
  const a = l.source as SN;
  const b = l.target as SN;
  if (a.x == null || b.x == null || a.y == null || b.y == null) return;
  const A = p.linkAlpha.get(l) ?? 1;
  const seed = hash(`${a.id}>${b.id}`);
  const lw = 1 / scale;
  ctx.save();
  const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  grad.addColorStop(0, hexA(s.groups[a.group], Math.min(0.9, s.linkAlpha * A)));
  grad.addColorStop(1, hexA(s.groups[b.group], Math.min(0.9, s.linkAlpha * A)));
  ctx.strokeStyle = grad;
  ctx.lineWidth = (l.type === "prereq" ? 0.7 + Math.min(l.weight, 4) * 0.25 : 0.8) * lw;
  const dash = LINK_DASH[l.type];
  if (dash.length) ctx.setLineDash(dash.map((d) => d * lw));
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (s.vine) {
    const [cx, cy] = ctrl(a, b, seed);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
  } else ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!reduced && A > 0.4) {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const count = l.type === "prereq" ? Math.min(1 + Math.floor(l.weight / 2), 2) : 1;
    for (let i = 0; i < count; i++) {
      const u = ((t * 0.035) / len + seed + i / count) % 1;
      comet(ctx, a, b, u, 1, Math.min(1, A), len, s, seed, scale, t);
      if (l.flow === "both") comet(ctx, a, b, 1 - u, -1, Math.min(1, A), len, s, seed, scale, t);
    }
  }
  ctx.restore();
}

function comet(ctx: CanvasRenderingContext2D, a: SN, b: SN, u: number, dir: number, A: number, len: number, s: StarStyle, seed: number, scale: number, t: number) {
  const col = s.comet[Math.floor(seed * 10) % s.comet.length];
  const [x, y] = at(a, b, u, !!s.vine, seed);
  const lw = 1 / scale;
  if (s.kind === "firefly") {
    ctx.globalCompositeOperation = "lighter";
    const w = Math.sin(t / 300 + seed * 40) * 2;
    soft(ctx, x + w, y - w, 7 * Math.max(lw, 0.6), col, 0.85 * A);
    ctx.globalCompositeOperation = "source-over";
    return;
  }
  const tail = Math.min(0.35, (30 * lw) / len);
  const u2 = Math.max(0, Math.min(1, u - tail * dir));
  const [tx, ty] = at(a, b, u2, !!s.vine, seed);
  if (s.darkSky) ctx.globalCompositeOperation = "lighter";
  const tg = ctx.createLinearGradient(tx, ty, x, y);
  tg.addColorStop(0, hexA(col, 0));
  tg.addColorStop(1, hexA(col, (s.darkSky ? 0.45 : 0.55) * A));
  ctx.strokeStyle = tg;
  ctx.lineWidth = 1.2 * lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  // 彗头：主题色的柔光，中心一点亮核
  soft(ctx, x, y, 4 * lw, col, (s.darkSky ? 0.55 : 0.5) * A);
  ctx.fillStyle = s.darkSky ? `rgba(255,255,255,${0.7 * A})` : hexA(col, 0.9 * A);
  ctx.beginPath();
  ctx.arc(x, y, 1.1 * lw, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

/**
 * 标签：大星常显，聚焦时显示邻域；按「下、右、左、上」寻找不与其他标签、星球重叠的位置。
 * 坐标都在图坐标系里，字号按缩放反比换算，屏幕上保持 12–13px。
 */
export function drawLabels(ctx: CanvasRenderingContext2D, nodes: SN[], s: StarStyle, p: Painter, scale: number, focus: string | null, near: Set<string> | null) {
  const pick = nodes
    .filter((n) => n.x != null && (n.r * scale > 7 || scale > 2.4 || (focus && (n.id === focus || near?.has(n.id)))))
    .sort((a, b) => Number(b.id === focus) - Number(a.id === focus) || b.r - a.r);
  const placed: [number, number, number, number][] = [];
  const lw = 1 / scale;
  const hitStar = (x0: number, y0: number, x1: number, y1: number) =>
    nodes.some((m) => {
      if (m.x == null || m.y == null) return false;
      const r = Math.max(m.r, 3) + 2 * lw;
      return m.x + r > x0 && m.x - r < x1 && m.y + r > y0 && m.y - r < y1;
    });
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const n of pick) {
    const big = n.r >= 9;
    const fs = (big ? 13 : 12) * lw;
    ctx.font = `${big ? 600 : 500} ${fs}px "PingFang SC","Noto Sans SC",sans-serif`;
    const w = ctx.measureText(n.label).width;
    const h = fs * 1.25;
    const r = Math.max(n.r, 3) * 1.15 + 5 * lw;
    const x = n.x!;
    const y = n.y!;
    const opts: [number, number][] = [
      [x - w / 2, y + r + 2 * lw],
      [x + r + 3 * lw, y - h / 2],
      [x - r - 3 * lw - w, y - h / 2],
      [x - w / 2, y - r - 2 * lw - h],
    ];
    let spot: [number, number, number, number] | null = null;
    for (const [x0, y0] of opts) {
      const x1 = x0 + w;
      const y1 = y0 + h;
      if (placed.some((q) => !(x1 < q[0] || x0 > q[2] || y1 < q[1] || y0 > q[3]))) continue;
      if (hitStar(x0 + 2 * lw, y0 + 2 * lw, x1 - 2 * lw, y1 - 2 * lw)) continue;
      spot = [x0, y0, x1, y1];
      break;
    }
    if (!spot) {
      if (n.id !== focus) continue;
      spot = [opts[0][0], opts[0][1], opts[0][0] + w, opts[0][1] + h];
    }
    placed.push(spot);
    const A = p.nodeAlpha.get(n.id) ?? 1;
    ctx.globalAlpha = Math.max(0.25, A);
    const ty = spot[1] + h / 2;
    if (s.darkSky) {
      ctx.shadowColor = "rgba(0,0,0,.75)";
      ctx.shadowBlur = 6;
    } else {
      ctx.strokeStyle = hexA(s.halo, 0.92);
      ctx.lineWidth = 4 * lw;
      ctx.lineJoin = "round";
      ctx.strokeText(n.label, spot[0], ty);
    }
    ctx.fillStyle = s.label;
    ctx.fillText(n.label, spot[0], ty);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
