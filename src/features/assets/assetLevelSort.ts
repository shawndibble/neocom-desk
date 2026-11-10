/**
 * One level of a station (or of a ship/container inside it): the nodes you can
 * open sit together ahead of the plain items, and a column label sorts both
 * groups by the same column. Pure: the caller supplies the figures.
 */
import { sortRowsBy } from '@/components/ui/dataTableSort';
import type { DataTableSort } from '@/components/ui/dataTableTypes';
import type { AssetTreeBayNode, AssetTreeItemNode, AssetTreeNode } from '@/engine/assetTree';

export type LevelSortColumn = 'name' | 'quantity' | 'volume' | 'value';

type OpenableNode = Exclude<AssetTreeNode, AssetTreeItemNode | AssetTreeBayNode>;

/** Bays (fixed order), ships and containers (anything that opens), then the plain items. */
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

/** What a node is sorted by; the caller knows names, prices and volumes. */
export interface LevelFigures<N> {
  name: (node: N) => string;
  quantity: (node: N) => number;
  volume: (node: N) => number | undefined;
  value: (node: N) => number;
}

/** `sort` null keeps the incoming order. A missing figure sinks to the end either way. */
export function sortLevelNodes<N>(
  nodes: readonly N[],
  sort: DataTableSort | null,
  figures: LevelFigures<N>
): N[] {
  if (sort === null) return [...nodes];
  const column = sort.columnId as LevelSortColumn;
  return sortRowsBy(nodes, (node) => figures[column](node), sort.direction);
}
