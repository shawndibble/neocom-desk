import type { AssetTreeNode, AssetTreeStation } from '@/engine/assetTree';

/** Path segment identifying one node among its siblings — stable across re-sorts and re-renders. */
export function nodeSegment(node: AssetTreeNode): string {
  return node.kind === 'bay' ? `b:${node.bay}` : `i:${node.asset.item_id}`;
}

export interface StationRow {
  type: 'station';
  key: string;
  station: AssetTreeStation;
}

export interface NodeRow {
  type: 'node';
  key: string;
  node: AssetTreeNode;
  depth: number;
  stationLocationId: number;
}

export type AssetRow = StationRow | NodeRow;

/**
 * Flattens the (already sorted, already search-pruned) station tree into the
 * single ordered row list the virtualizer renders — one row per station
 * header plus one per visible tree node, expanding only branches whose path
 * is in `expandedKeys`. Callers re-run this on every change to the tree or to
 * `expandedKeys` (search re-prunes upstream, then this re-flattens) rather
 * than the virtualizer ever seeing the nested shape.
 */
export function flattenAssetRows(
  stations: readonly AssetTreeStation[],
  expandedKeys: ReadonlySet<string>
): AssetRow[] {
  const rows: AssetRow[] = [];
  for (const station of stations) {
    const stationKey = `station:${station.locationId}`;
    rows.push({ type: 'station', key: stationKey, station });
    pushNodeRows(rows, station.children, stationKey, 0, station.locationId, expandedKeys);
  }
  return rows;
}

function pushNodeRows(
  rows: AssetRow[],
  nodes: readonly AssetTreeNode[],
  parentPath: string,
  depth: number,
  stationLocationId: number,
  expandedKeys: ReadonlySet<string>
): void {
  for (const node of nodes) {
    const path = `${parentPath}/${nodeSegment(node)}`;
    rows.push({ type: 'node', key: path, node, depth, stationLocationId });
    if (node.kind !== 'item' && expandedKeys.has(path)) {
      pushNodeRows(rows, node.children, path, depth + 1, stationLocationId, expandedKeys);
    }
  }
}
