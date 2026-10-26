"use client";

import { useEffect, useRef } from "react";
import type { ConfigOptions, ForceGraph3DInstance, LinkObject, NodeObject } from "3d-force-graph";
import { AREA_ORDER } from "@/lib/schema";
import { constellationCenters, type StarLink, type StarNode } from "@/lib/starmap";
import type { StarStyle } from "@/lib/star-themes";
import { createPainter, spriteCanvas } from "./starfield/paint";
import type { FlyRef } from "./starmap-shared";

type SN = StarNode & NodeObject;
type SL = Omit<StarLink, "source" | "target"> & LinkObject<SN> & { source: string | SN; target: string | SN };
type FG3D = new (el: HTMLElement, cfg?: ConfigOptions) => ForceGraph3DInstance<SN, SL>;

/**
 * 沉浸模式：3D 星系。只在用户切换过来时才加载（three.js 体积较大）。
 * 星球直接复用 2D 的材质贴图；深色天空开辉光，浅色天空关辉光、用正常混合。换主题时整体重建。
 */
export default function StarMap3D({
  data,
  onSelect,
  reduced,
  flyRef,
  style,
}: {
  data: { nodes: StarNode[]; links: StarLink[] };
  onSelect: (id: string | null) => void;
  reduced: boolean;
  flyRef: FlyRef;
  style: StarStyle;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraph3DInstance<SN, SL> | null>(null);
  const objs = useRef(new Map<string, SN>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const [{ default: ForceGraph3D }, THREE, { default: SpriteText }, { UnrealBloomPass }, { forceX, forceY }] = await Promise.all([
        import("3d-force-graph"),
        import("three"),
        import("three-spritetext"),
        import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
        import("d3-force"),
      ]);
      const host = hostRef.current;
      if (disposed || !host) return;

      const painter = createPainter("3d");
      const textures = new Map<string, InstanceType<typeof THREE.CanvasTexture>>();
      const textureOf = (n: SN) => {
        const sp = spriteCanvas(painter, style, n, 4);
        const key = `${n.group}:${sp.half}`;
        let tex = textures.get(key);
        if (!tex) {
          tex = new THREE.CanvasTexture(sp.c);
          tex.colorSpace = THREE.SRGBColorSpace;
          textures.set(key, tex);
        }
        return { tex, size: sp.half * 2 };
      };
      const labelBg = style.darkSky ? "rgba(8,12,22,.82)" : "rgba(255,255,255,.88)";

      const fg = new (ForceGraph3D as unknown as FG3D)(host, { controlType: "orbit" })
        .width(host.clientWidth)
        .height(host.clientHeight)
        .backgroundColor(style.darkSky ? style.sky[2] : style.sky[1])
        .showNavInfo(false)
        .nodeId("id")
        .nodeLabel((n) => `<div style="font:13px PingFang SC,sans-serif;padding:4px 8px;background:${labelBg};border-radius:8px;color:${style.label}">${n.label}</div>`)
        .nodeThreeObject((n) => {
          const group = new THREE.Group();
          const { tex, size } = textureOf(n);
          const star = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: tex, transparent: true, blending: style.darkSky ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }),
          );
          star.scale.set(size, size, 1);
          group.add(star);
          if (n.r > 4.5 || n.foundation) {
            const label = new SpriteText(n.label, Math.max(3.4, n.r * 0.6), style.label);
            label.fontFace = '"PingFang SC","Noto Sans SC",sans-serif';
            label.position.y = -(n.r * 1.5 + 5);
            group.add(label);
          }
          return group;
        })
        .linkColor((l) => style.groups[(typeof l.source === "object" ? l.source : objs.current.get(String(l.source)))?.group ?? "theory"])
        .linkOpacity(Math.min(0.5, style.linkAlpha * 1.6))
        .linkWidth(0)
        .linkDirectionalParticles((l) => (reducedRef.current ? 0 : l.type === "prereq" ? Math.min(1 + Math.floor(l.weight / 2), 3) : 1))
        .linkDirectionalParticleSpeed(0.0045)
        .linkDirectionalParticleWidth((l) => (l.type === "prereq" ? 2 : 1.5))
        .linkDirectionalParticleColor(() => style.comet[0])
        .onNodeClick((n) => {
          onSelectRef.current(String(n.id));
          fly(String(n.id));
        })
        .onBackgroundClick(() => onSelectRef.current(null));

      const centers = constellationCenters([...AREA_ORDER], 260);
      fg.d3Force("x", forceX<SN>((n) => centers.get(n.area)?.x ?? 0).strength(0.05) as never);
      fg.d3Force("y", forceY<SN>((n) => centers.get(n.area)?.y ?? 0).strength(0.05) as never);
      (fg.d3Force("charge") as unknown as { strength: (v: number) => void } | undefined)?.strength(-70);

      // 辉光：只在深色天空上开
      if (style.bloom > 0) fg.postProcessingComposer().addPass(new UnrealBloomPass(new THREE.Vector2(host.clientWidth, host.clientHeight), style.bloom, 0.4, 0.3));

      // 远处的星空
      const N = 2200;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const r = 1800 + Math.random() * 2200;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pos.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p)], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      fg.scene().add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({ color: style.darkSky ? 0xdfe8ff : new THREE.Color(style.constel).getHex(), size: 3, sizeAttenuation: true, transparent: true, opacity: style.darkSky ? 0.75 : 0.28 }),
        ),
      );

      // 布局稳定后把整个星系拉到视野里
      let first = true;
      fg.cooldownTicks(220).onEngineStop(() => {
        if (first) {
          first = false;
          fg.zoomToFit(900, 30);
        }
      });

      const controls = fg.controls() as { autoRotate: boolean; autoRotateSpeed: number };
      controls.autoRotate = !reducedRef.current;
      controls.autoRotateSpeed = 0.35;

      const fly = (id: string) => {
        const n = objs.current.get(id);
        if (!n || n.x == null || n.y == null || n.z == null) return;
        const dist = 90 + n.r * 6;
        const ratio = 1 + dist / (Math.hypot(n.x, n.y, n.z) || 1);
        fg.cameraPosition({ x: n.x * ratio, y: n.y * ratio, z: n.z * ratio }, { x: n.x, y: n.y, z: n.z }, 1200);
      };
      flyRef.current = fly;
      fgRef.current = fg;
      setData(dataRef.current);

      ro = new ResizeObserver(() => fg.width(host.clientWidth).height(host.clientHeight));
      ro.observe(host);
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      fgRef.current?._destructor();
      fgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setData(d: { nodes: StarNode[]; links: StarLink[] }) {
    const fg = fgRef.current;
    if (!fg) return;
    const nodes = d.nodes.map((n) => {
      const o = objs.current.get(n.id);
      if (o) return Object.assign(o, n);
      const fresh = { ...n } as SN;
      objs.current.set(n.id, fresh);
      return fresh;
    });
    fg.graphData({ nodes, links: d.links.map((l) => ({ ...l })) as SL[] });
  }

  useEffect(() => {
    setData(data);
  }, [data]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    (fg.controls() as { autoRotate: boolean }).autoRotate = !reduced;
    fg.linkDirectionalParticles(fg.linkDirectionalParticles());
  }, [reduced]);

  return <div ref={hostRef} style={{ height: "clamp(480px, 74vh, 860px)" }} role="img" aria-label="三维概念星系：拖动旋转，点星飞近" />;
}
