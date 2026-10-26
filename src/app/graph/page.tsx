import StarMap from "@/components/StarMap";
import { PageHeader } from "@/components/ui";
import { getIndex } from "@/lib/content";
import { starGraph } from "@/lib/starmap";

export const metadata = { title: "繁星图 · 法脉·刑法学" };

export default function GraphPage() {
  const { nodes, links } = starGraph(getIndex());
  return (
    <>
      <PageHeader eyebrow="概念图谱" title="刑法概念的繁星图">
        <p className="text-ink-2">
          每颗星是一个专题概念。星越大，越是上位：依赖它的问题、挂在它之下的概念越多；带十字光芒的是根据论。同一体系位置的概念聚成一个星座。
          连线上流动的光点，从上位概念流向下位概念；跨法系的功能对应、对称问题与对立关系双向流动。
        </p>
      </PageHeader>
      <StarMap nodes={nodes} links={links} />
    </>
  );
}
