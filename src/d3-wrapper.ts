import { hierarchy, treemap, treemapBinary } from 'd3-hierarchy';
import type { NormalizedRepository, TreemapNode } from './types';

export function computeTreemapLayout(
  items: NormalizedRepository[],
  width: number,
  height: number
): { leaves(): TreemapNode[] } {
  const root = hierarchy({ children: items })
    .sum((d: { stars?: number } | { children?: NormalizedRepository[] }) => {
      // d is the data object, which could be the root or a NormalizedRepository
      if ('stars' in d && typeof d.stars === 'number') {
        return Math.max(1, Math.log2(d.stars + 1));
      }
      return 1;
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const treemapLayout = treemap()
    .tile(treemapBinary)
    .size([width, height])
    .paddingInner(2)
    .round(true);

  return treemapLayout(root as unknown as Parameters<typeof treemapLayout>[0]) as {
    leaves(): TreemapNode[];
  };
}
