import type { JumpsAwayResult } from './clone/jumpsAway';

export interface EngineAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: 'station' | 'solar_system' | 'item' | 'other';
  location_flag: string;
  is_blueprint_copy?: boolean;
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
  itemCount: number;
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

export type StationSortField = 'name' | 'value' | 'itemCount' | 'jumpsAway';

export interface StationSortContext {
  labelFor: (station: AssetTreeStation) => string;
  pinnedFor: (station: AssetTreeStation) => boolean;
  jumpsAwayFor: (station: AssetTreeStation) => JumpsAwayResult | undefined;
}

function jumpsAwayValue(result: JumpsAwayResult | undefined): number {
  return result?.kind === 'known' ? result.jumps : Number.POSITIVE_INFINITY;
}

export function compareStations(
  a: AssetTreeStation,
  b: AssetTreeStation,
  field: StationSortField,
  ctx: StationSortContext
): number {
  const pinnedA = ctx.pinnedFor(a);
  const pinnedB = ctx.pinnedFor(b);
  if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;

  switch (field) {
    case 'name':
      return ctx.labelFor(a).localeCompare(ctx.labelFor(b));
    case 'value':
      return b.estimatedValue - a.estimatedValue;
    case 'itemCount':
      return b.itemCount - a.itemCount;
    case 'jumpsAway':
      return jumpsAwayValue(ctx.jumpsAwayFor(a)) - jumpsAwayValue(ctx.jumpsAwayFor(b));
  }
}

const FITTING_SLOT_PATTERN = /^(Hi|Med|Lo|Rig|SubSystem|Service)Slot\d+$/;

function bayKindFor(locationFlag: string): AssetTreeBayKind | null {
  if (locationFlag === 'Cargo') return 'cargoHold';
  if (locationFlag === 'DroneBay') return 'droneBay';
  if (FITTING_SLOT_PATTERN.test(locationFlag)) return 'fitting';
  return null;
}

export function isShipBayFlag(locationFlag: string): boolean {
  return bayKindFor(locationFlag) !== null;
}

const BAY_ORDER: AssetTreeBayKind[] = ['cargoHold', 'droneBay', 'fitting'];

interface BuildContext {
  childrenByLocationId: Map<number, EngineAsset[]>;
  priceByTypeId: ReadonlyMap<number, number>;
  itemValueByItemId: ReadonlyMap<number, number>;
  visited: Set<number>;
}

function childrenByLocationId(assets: readonly EngineAsset[]): Map<number, EngineAsset[]> {
  const map = new Map<number, EngineAsset[]>();
  for (const a of assets) {
    const list = map.get(a.location_id) ?? [];
    list.push(a);
    map.set(a.location_id, list);
  }
  return map;
}

const NO_ITEM_VALUES: ReadonlyMap<number, number> = new Map();

export function assetStackValue(
  asset: Pick<EngineAsset, 'item_id' | 'type_id' | 'quantity' | 'is_blueprint_copy'>,
  priceByTypeId: ReadonlyMap<number, number>,
  itemValueByItemId: ReadonlyMap<number, number> = NO_ITEM_VALUES
): number {
  const own = itemValueByItemId.get(asset.item_id);
  if (own !== undefined) return own;
  if (asset.is_blueprint_copy) return 0;
  return asset.quantity * (priceByTypeId.get(asset.type_id) ?? 0);
}

export function nodeContribution(
  node: AssetTreeNode,
  priceByTypeId: ReadonlyMap<number, number>,
  itemValueByItemId: ReadonlyMap<number, number> = NO_ITEM_VALUES
): { itemCount: number; estimatedValue: number } {
  if (node.kind === 'bay')
    return { itemCount: node.itemCount, estimatedValue: node.estimatedValue };
  const ownValue = assetStackValue(node.asset, priceByTypeId, itemValueByItemId);
  if (node.kind === 'item') return { itemCount: node.asset.quantity, estimatedValue: ownValue };
  return {
    itemCount: node.asset.quantity + node.itemCount,
    estimatedValue: ownValue + node.estimatedValue,
  };
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

function sumNodes(
  ctx: BuildContext,
  nodes: readonly AssetTreeNode[]
): { itemCount: number; estimatedValue: number } {
  let itemCount = 0;
  let estimatedValue = 0;
  for (const node of nodes) {
    const contribution = nodeContribution(node, ctx.priceByTypeId, ctx.itemValueByItemId);
    itemCount += contribution.itemCount;
    estimatedValue += contribution.estimatedValue;
  }
  return { itemCount, estimatedValue };
}

export function collectItemIds(node: AssetTreeNode): number[] {
  if (node.kind === 'item') return [node.asset.item_id];
  return node.children.flatMap(collectItemIds);
}

export function collectStationItemIds(station: AssetTreeStation): number[] {
  return station.children.flatMap(collectItemIds);
}

export function totalEstimatedValue(stations: readonly AssetTreeStation[]): number {
  return stations.reduce((sum, station) => sum + station.estimatedValue, 0);
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

export interface AssetTreeGroup<Id> {
  id: Id;
  children: AssetTreeNode[];
  itemCount: number;
  estimatedValue: number;
}

export function buildAssetGroups<Id>(
  assets: readonly EngineAsset[],
  order: readonly Id[],
  alwaysInclude: ReadonlySet<Id>,
  groupIdFor: (asset: EngineAsset) => Id,
  priceByTypeId: ReadonlyMap<number, number> = new Map(),
  itemValueByItemId: ReadonlyMap<number, number> = NO_ITEM_VALUES
): AssetTreeGroup<Id>[] {
  const ctx: BuildContext = {
    childrenByLocationId: childrenByLocationId(assets),
    priceByTypeId,
    itemValueByItemId,
    visited: new Set(),
  };

  const childrenById = new Map<Id, AssetTreeNode[]>();
  const pushRoot = (id: Id, asset: EngineAsset) => {
    const list = childrenById.get(id) ?? [];
    list.push(buildNode(ctx, asset, new Set()));
    childrenById.set(id, list);
  };

  for (const a of assets) {
    if (a.location_type !== 'item') pushRoot(groupIdFor(a), a);
  }

  const presentItemIds = new Set(assets.map((a) => a.item_id));
  const unreached = (a: EngineAsset) => a.location_type === 'item' && !ctx.visited.has(a.item_id);

  for (const a of assets) {
    if (unreached(a) && !presentItemIds.has(a.location_id)) pushRoot(groupIdFor(a), a);
  }

  for (const a of assets) {
    if (unreached(a)) pushRoot(groupIdFor(a), a);
  }

  const groups: AssetTreeGroup<Id>[] = [];
  for (const id of order) {
    const children = childrenById.get(id);
    if (children && children.length > 0) {
      const { itemCount, estimatedValue } = sumNodes(ctx, children);
      groups.push({ id, children, itemCount, estimatedValue });
    } else if (alwaysInclude.has(id)) {
      groups.push({ id, children: [], itemCount: 0, estimatedValue: 0 });
    }
  }
  return groups;
}

export function buildAssetTree(
  assets: readonly EngineAsset[],
  priceByTypeId: ReadonlyMap<number, number> = new Map(),
  itemValueByItemId: ReadonlyMap<number, number> = NO_ITEM_VALUES
): AssetTreeStation[] {
  const ctx: BuildContext = {
    childrenByLocationId: childrenByLocationId(assets),
    priceByTypeId,
    itemValueByItemId,
    visited: new Set(),
  };
  const buildStation = (locationId: number, group: RootGroup): AssetTreeStation => {
    const children = group.roots.map((a) => buildNode(ctx, a, new Set()));
    const { itemCount, estimatedValue } = sumNodes(ctx, children);
    return { locationId, locationType: group.locationType, children, itemCount, estimatedValue };
  };

  const stations: AssetTreeStation[] = [];

  const realRoots = groupByLocationId(assets.filter((a) => a.location_type !== 'item'));
  for (const [locationId, group] of realRoots) stations.push(buildStation(locationId, group));

  const presentItemIds = new Set(assets.map((a) => a.item_id));
  const unreached = (a: EngineAsset) => a.location_type === 'item' && !ctx.visited.has(a.item_id);

  const absentParentGroups = groupByLocationId(
    assets.filter((a) => unreached(a) && !presentItemIds.has(a.location_id))
  );
  for (const [locationId, group] of absentParentGroups)
    stations.push(buildStation(locationId, group));

  for (const [locationId, group] of groupByLocationId(assets.filter(unreached))) {
    const roots = group.roots.filter((a) => !ctx.visited.has(a.item_id));
    if (roots.length === 0) continue;
    stations.push(buildStation(locationId, { ...group, roots }));
  }

  return stations;
}
