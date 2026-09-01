/**
 * Flat ESI CharacterAsset[] -> nested Station -> Ship/Container -> ... tree.
 * Decoupled from src/esi (see engine/types.ts) — callers adapt CharacterAsset
 * to EngineAsset, which it is already structurally identical to.
 *
 * Ship vs. plain container is a flag heuristic, not an SDE category lookup
 * (pure engines don't fetch): an asset is treated as a ship only if at least
 * one of its direct children sits in a recognized ship bay (Cargo, DroneBay,
 * or a fitted slot). A ship with every bay empty (nothing fit, nothing in
 * the hold) is indistinguishable from a plain item and renders as a leaf —
 * there is nothing to expand into either way.
 */

export interface EngineAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: 'station' | 'solar_system' | 'item' | 'other';
  location_flag: string;
}

export type AssetTreeBayKind = 'cargoHold' | 'droneBay' | 'fitting';

export interface AssetTreeItemNode {
  kind: 'item';
  asset: EngineAsset;
}

export interface AssetTreeBayNode {
  kind: 'bay';
  bay: AssetTreeBayKind;
  children: AssetTreeNode[];
  itemCount: number;
  estimatedValue: number;
}

export interface AssetTreeContainerNode {
  kind: 'ship' | 'container';
  asset: EngineAsset;
  children: AssetTreeNode[];
  /** Nested item count across all descendants — excludes this node's own quantity. */
  itemCount: number;
  /** Nested estimated value across all descendants — excludes this node's own value. */
  estimatedValue: number;
}

export type AssetTreeNode = AssetTreeItemNode | AssetTreeBayNode | AssetTreeContainerNode;

export interface AssetTreeStation {
  locationId: number;
  locationType: EngineAsset['location_type'];
  children: AssetTreeNode[];
  itemCount: number;
  estimatedValue: number;
}

const FITTING_SLOT_PATTERN = /^(Hi|Med|Lo|Rig|SubSystem|Service)Slot\d+$/;

function bayKindFor(locationFlag: string): AssetTreeBayKind | null {
  if (locationFlag === 'Cargo') return 'cargoHold';
  if (locationFlag === 'DroneBay') return 'droneBay';
  if (FITTING_SLOT_PATTERN.test(locationFlag)) return 'fitting';
  return null;
}

const BAY_ORDER: AssetTreeBayKind[] = ['cargoHold', 'droneBay', 'fitting'];

interface BuildContext {
  childrenByLocationId: Map<number, EngineAsset[]>;
  priceByTypeId: ReadonlyMap<number, number>;
  visited: Set<number>;
}

/** This node's own quantity/value, not counting its children — 0 for bays, which own nothing themselves. */
function ownValue(ctx: BuildContext, asset: EngineAsset): number {
  return asset.quantity * (ctx.priceByTypeId.get(asset.type_id) ?? 0);
}

function buildNode(
  ctx: BuildContext,
  asset: EngineAsset,
  ancestors: ReadonlySet<number>
): AssetTreeNode {
  if (ancestors.has(asset.item_id)) return { kind: 'item', asset };
  ctx.visited.add(asset.item_id);

  const rawChildren = ctx.childrenByLocationId.get(asset.item_id) ?? [];
  if (rawChildren.length === 0) return { kind: 'item', asset };

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(asset.item_id);

  const isShip = rawChildren.some((c) => bayKindFor(c.location_flag) !== null);

  const children: AssetTreeNode[] = isShip
    ? buildShipChildren(ctx, rawChildren, nextAncestors)
    : rawChildren.map((c) => buildNode(ctx, c, nextAncestors));

  const { itemCount, estimatedValue } = sumNodes(ctx, children);
  return { kind: isShip ? 'ship' : 'container', asset, children, itemCount, estimatedValue };
}

function buildShipChildren(
  ctx: BuildContext,
  rawChildren: EngineAsset[],
  ancestors: ReadonlySet<number>
): AssetTreeNode[] {
  const byBay = new Map<AssetTreeBayKind, EngineAsset[]>();
  const direct: EngineAsset[] = [];

  for (const child of rawChildren) {
    const bay = bayKindFor(child.location_flag);
    if (bay === null) {
      direct.push(child);
      continue;
    }
    const list = byBay.get(bay) ?? [];
    list.push(child);
    byBay.set(bay, list);
  }

  const bayNodes: AssetTreeNode[] = BAY_ORDER.filter((bay) => byBay.has(bay)).map((bay) => {
    const bayChildren = (byBay.get(bay) ?? []).map((c) => buildNode(ctx, c, ancestors));
    const { itemCount, estimatedValue } = sumNodes(ctx, bayChildren);
    return { kind: 'bay', bay, children: bayChildren, itemCount, estimatedValue };
  });

  const directNodes = direct.map((c) => buildNode(ctx, c, ancestors));
  return [...bayNodes, ...directNodes];
}

/** Sums each child's own contribution (its value/quantity) plus whatever it already aggregated below it. */
function sumNodes(
  ctx: BuildContext,
  nodes: readonly AssetTreeNode[]
): { itemCount: number; estimatedValue: number } {
  let itemCount = 0;
  let estimatedValue = 0;
  for (const node of nodes) {
    if (node.kind === 'bay') {
      itemCount += node.itemCount;
      estimatedValue += node.estimatedValue;
    } else {
      itemCount += node.asset.quantity + (node.kind === 'item' ? 0 : node.itemCount);
      estimatedValue +=
        ownValue(ctx, node.asset) + (node.kind === 'item' ? 0 : node.estimatedValue);
    }
  }
  return { itemCount, estimatedValue };
}

interface RootGroup {
  locationType: EngineAsset['location_type'];
  roots: EngineAsset[];
}

function groupByLocationId(assets: readonly EngineAsset[]): Map<number, RootGroup> {
  const groups = new Map<number, RootGroup>();
  for (const a of assets) {
    let group = groups.get(a.location_id);
    if (!group) {
      group = { locationType: a.location_type, roots: [] };
      groups.set(a.location_id, group);
    }
    group.roots.push(a);
  }
  return groups;
}

export function buildAssetTree(
  assets: readonly EngineAsset[],
  priceByTypeId: ReadonlyMap<number, number> = new Map()
): AssetTreeStation[] {
  const childrenByLocationId = new Map<number, EngineAsset[]>();
  for (const a of assets) {
    const list = childrenByLocationId.get(a.location_id) ?? [];
    list.push(a);
    childrenByLocationId.set(a.location_id, list);
  }

  const ctx: BuildContext = { childrenByLocationId, priceByTypeId, visited: new Set() };
  const buildStation = (locationId: number, group: RootGroup): AssetTreeStation => {
    const children = group.roots.map((a) => buildNode(ctx, a, new Set()));
    const { itemCount, estimatedValue } = sumNodes(ctx, children);
    return { locationId, locationType: group.locationType, children, itemCount, estimatedValue };
  };

  const stations: AssetTreeStation[] = [];

  // Real roots: anything not nested inside another owned asset (ESI never marks these
  // 'item'). Build these first so `visited` reflects everything actually reachable
  // before deciding what counts as an orphan below.
  const realRoots = groupByLocationId(assets.filter((a) => a.location_type !== 'item'));
  for (const [locationId, group] of realRoots) stations.push(buildStation(locationId, group));

  // Orphans: an 'item'-typed asset never reached from a real root — either its parent is
  // missing from this list, or it's part of an isolated cycle. Each becomes its own
  // top-level group (or joins a sibling orphan sharing the same location_id), matching
  // the flat fallback this replaces. Re-checked at build time: a sibling orphan
  // processed earlier in this same pass may already have pulled this one in as a
  // descendant, in which case it's not built again here.
  const orphanCandidates = groupByLocationId(
    assets.filter((a) => a.location_type === 'item' && !ctx.visited.has(a.item_id))
  );
  for (const [locationId, group] of orphanCandidates) {
    const roots = group.roots.filter((a) => !ctx.visited.has(a.item_id));
    if (roots.length === 0) continue;
    stations.push(buildStation(locationId, { ...group, roots }));
  }

  return stations;
}
