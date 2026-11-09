/**
 * One level of a station (or of a ship/container inside it): the nodes you can
 * open sit together ahead of the plain items, and only the items re-sort when a
 * column label is clicked. Pure: the caller supplies the figures.
 */
import { sortRowsBy } from '@/components/ui/dataTableSort';
import type { DataTableSort } from '@/components/ui/dataTableTypes';
import type { AssetTreeItemNode, AssetTreeNode } from '@/engine/assetTree';

export type LevelSortColumn = 'name' | 'quantity' | 'volume' | 'value';

/** Ships, containers and bays (anything that opens), then the plain items; order within each kept. */
export function splitLevelNodes(children: readonly AssetTreeNode[]): {
  containers: AssetTreeNode[];
  items: AssetTreeItemNode[];
} {
  const containers: AssetTreeNode[] = [];
  const items: AssetTreeItemNode[] = [];
  for (const node of children) {
    if (node.kind === 'item') items.push(node);
    else containers.push(node);
  }
  return { containers, items };
}

/** `sort` null keeps the level's name order. A missing unit volume sinks to the end. */
export function sortLevelItems(
  items: readonly AssetTreeItemNode[],
  sort: DataTableSort | null,
  figures: {
    name: (node: AssetTreeItemNode) => string;
    volume: (node: AssetTreeItemNode) => number | undefined;
    value: (node: AssetTreeItemNode) => number;
  }
): AssetTreeItemNode[] {
  if (sort === null) return [...items];
  const valueOf = (node: AssetTreeItemNode): string | number | undefined => {
    switch (sort.columnId as LevelSortColumn) {
      case 'name':
        return figures.name(node);
      case 'quantity':
        return node.asset.quantity;
      case 'volume':
        return figures.volume(node);
      case 'value':
        return figures.value(node);
    }
  };
  return sortRowsBy(items, valueOf, sort.direction);
}
