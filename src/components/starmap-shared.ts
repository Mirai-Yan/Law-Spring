import type { LinkObject, NodeObject } from "force-graph";
import type { StarLink, StarLinkType, StarNode } from "@/lib/starmap";

/** 繁星图 2D 与 3D 共用的类型、关系名称与工具；配色与材质见 src/lib/star-themes.ts */

export const LINK_LABEL: Record<StarLinkType, string> = {
  prereq: "先决（问题层汇总）",
  is_a: "属种",
  part_of: "构成要素",
  derived_from: "派生",
  functional_equivalent: "跨法系功能对应",
  symmetric: "对称问题",
  opposes: "对立",
  transplanted_to: "继受",
};
export const LINK_ORDER: StarLinkType[] = ["prereq", "derived_from", "part_of", "is_a", "functional_equivalent", "symmetric", "opposes", "transplanted_to"];

export type SN = StarNode & NodeObject;
export type SL = Omit<StarLink, "source" | "target"> & LinkObject<SN> & { source: string | SN; target: string | SN };

export function stripWiki(s?: string) {
  return (s ?? "").replace(/\[\[[a-z]+:([^|\]]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[[a-z]+:([^\]]+)\]\]/g, "$1");
}

export type FlyRef = React.MutableRefObject<(id: string) => void>;
