import { sortRowsBy } from '@/components/ui/dataTableSort';
import type { DataTableSort } from '@/components/ui/dataTableTypes';
import type { AssetTreeBayNode, AssetTreeItemNode, AssetTreeNode } from '@/engine/assetTree';

export type LevelSortColumn = 'name' | 'quantity' | 'volume' | 'value';

type OpenableNode = Exclude<AssetTreeNode, AssetTreeItemNode | AssetTreeBayNode>;

export function splitLevelNodes(children: readonly AssetTreeNode[]): {
  bays: AssetTreeBayNode[];
  containers: OpenableNode[];
  items: AssetTreeItemNode[];
} {
  const bays: AssetTreeBayNode[] = [];
  const containers: OpenableNode[] = [];
  const items: AssetTreeItemNode[] = [];
  for (const node of children) {
    if (node.kind === 'bay') bays.push(node);
    else if (node.kind === 'item') items.push(node);
    else containers.push(node);
  }
  return { bays, containers, items };
}

export interface LevelFigures<N> {
  name: (node: N) => string;
  quantity: (node: N) => number;
  volume: (node: N) => number | undefined;
  value: (node: N) => number;
}

export function sortLevelNodes<N>(
  nodes: readonly N[],
  sort: DataTableSort | null,
  figures: LevelFigures<N>
): N[] {
  if (sort === null) return [...nodes];
  const column = sort.columnId as LevelSortColumn;
  return sortRowsBy(nodes, (node) => figures[column](node), sort.direction);
}
