/**
 * Prunes a built asset tree to the assets a predicate keeps (issue #5601).
 *
 * A kept asset keeps its whole container path; a station, ship, bay or
 * container with nothing kept beneath it (and not itself kept) is dropped.
 * Counts and values are recomputed over the kept assets only: an ancestor that
 * is itself filtered out contributes nothing of its own, just what is beneath.
 */
import {
  assetStackValue,
  type AssetTreeNode,
  type AssetTreeStation,
  type EngineAsset,
} from './assetTree';

interface Totals {
  itemCount: number;
  estimatedValue: number;
}

export function pruneAssetTree(
  stations: readonly AssetTreeStation[],
  keep: (asset: EngineAsset) => boolean,
  priceByTypeId: ReadonlyMap<number, number>,
  itemValueByItemId: ReadonlyMap<number, number>
): AssetTreeStation[] {
  const own = (asset: EngineAsset, kept: boolean): Totals =>
    kept
      ? {
          itemCount: asset.quantity,
          estimatedValue: assetStackValue(asset, priceByTypeId, itemValueByItemId),
        }
      : { itemCount: 0, estimatedValue: 0 };

  const sum = (nodes: readonly AssetTreeNode[]): Totals => {
    let itemCount = 0;
    let estimatedValue = 0;
    for (const node of nodes) {
      const totals = nodeTotals(node);
      itemCount += totals.itemCount;
      estimatedValue += totals.estimatedValue;
    }
    return { itemCount, estimatedValue };
  };

  // A node's own kept stack plus everything already aggregated beneath it.
  function nodeTotals(node: AssetTreeNode): Totals {
    if (node.kind === 'bay') return node;
    const self = own(node.asset, keep(node.asset));
    if (node.kind === 'item') return self;
    return {
      itemCount: self.itemCount + node.itemCount,
      estimatedValue: self.estimatedValue + node.estimatedValue,
    };
  }

  function pruneNode(node: AssetTreeNode): AssetTreeNode | null {
    if (node.kind === 'item') return keep(node.asset) ? node : null;
    const children = node.children.flatMap((child) => pruneNode(child) ?? []);
    if (node.kind === 'bay') {
      return children.length > 0 ? { ...node, children, ...sum(children) } : null;
    }
    if (children.length === 0) {
      // A kept container with nothing kept inside reads as a plain item.
      return keep(node.asset) ? { kind: 'item', asset: node.asset } : null;
    }
    return { ...node, children, ...sum(children) };
  }

  return stations.flatMap((station) => {
    const children = station.children.flatMap((child) => pruneNode(child) ?? []);
    return children.length > 0 ? [{ ...station, children, ...sum(children) }] : [];
  });
}
