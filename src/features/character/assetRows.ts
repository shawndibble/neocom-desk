import type { AssetTreeNode, AssetTreeStation } from '@/engine/assetTree';

/** Path segment identifying one node among its siblings — stable across re-sorts and re-renders. */
export function nodeSegment(node: AssetTreeNode): string {
  return node.kind === 'bay' ? `b:${node.bay}` : `i:${node.asset.item_id}`;
}

/** Row key for a station header — the root of every path under it. */
export function stationRowKey(locationId: number): string {
  return `station:${locationId}`;
}

export interface StationRow {
  type: 'station';
  key: string;
  station: AssetTreeStation;
  /** 1-based tree depth, for `aria-level` — a station is always the tree root level. */
  level: number;
  /** 1-based position among sibling stations, for `aria-posinset`. */
  posinset: number;
  /** Sibling station count, for `aria-setsize`. */
  setsize: number;
}

export interface NodeRow {
  type: 'node';
  key: string;
  node: AssetTreeNode;
  depth: number;
  stationLocationId: number;
  /** 1-based tree depth, for `aria-level` — `depth + 2` (a station occupies level 1). */
  level: number;
  /** 1-based position among sibling nodes at this depth, for `aria-posinset`. */
  posinset: number;
  /** Sibling count at this depth, for `aria-setsize`. */
  setsize: number;
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
  const setsize = stations.length;
  stations.forEach((station, index) => {
    const stationKey = stationRowKey(station.locationId);
    rows.push({
      type: 'station',
      key: stationKey,
      station,
      level: 1,
      posinset: index + 1,
      setsize,
    });
    if (expandedKeys.has(stationKey)) {
      pushNodeRows(rows, station.children, stationKey, 0, {
        stationLocationId: station.locationId,
        expandedKeys,
      });
    }
  });
  return rows;
}

/** Carried unchanged through the recursion below — only `parentPath`/`depth` vary per call. */
interface PushContext {
  stationLocationId: number;
  expandedKeys: ReadonlySet<string>;
}

function pushNodeRows(
  rows: AssetRow[],
  nodes: readonly AssetTreeNode[],
  parentPath: string,
  depth: number,
  ctx: PushContext
): void {
  const setsize = nodes.length;
  nodes.forEach((node, index) => {
    const path = `${parentPath}/${nodeSegment(node)}`;
    rows.push({
      type: 'node',
      key: path,
      node,
      depth,
      stationLocationId: ctx.stationLocationId,
      level: depth + 2,
      posinset: index + 1,
      setsize,
    });
    if (node.kind !== 'item' && ctx.expandedKeys.has(path)) {
      pushNodeRows(rows, node.children, path, depth + 1, ctx);
    }
  });
}
