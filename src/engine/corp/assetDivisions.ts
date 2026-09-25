/**
 * Corp assets, grouped division-first (issue #330), now onto the same
 * virtualized tree engine `/assets` uses (issue #779).
 *
 * Round 41/44 (CONTEXT.md) rejected reusing `engine/assetTree.ts`: division
 * lives in `location_flag` (`CorpSAG1`..`CorpSAG7`), which has no `item_id`
 * to key a URL segment on, and that engine had no grouping level between a
 * station and a container to express it. That reasoning didn't account for
 * the fact the tree engine already solves an identical problem for bay
 * nodes — grouped by `location_flag`, addressed by kind rather than an asset
 * id it doesn't have (`AssetTreeBayNode`, `assetNodeSegment`'s `b:${bay}`).
 * `buildAssetGroups` (`engine/assetTree.ts`) generalizes exactly that
 * mechanism to an arbitrary top-level grouping, so this module is now a thin
 * division-shaped adapter over it rather than its own flat implementation —
 * see `docs/context/decisions/` for the decision reversing round 41/44.
 *
 * Pure (CLAUDE.md): no `fetch`/DOM/Dexie import, and no `@/esi/endpoints`
 * import either — `features/corp/assets.ts` adapts ESI's `CorporationAsset`
 * (snake_case, extra fields this grouping never uses) into `CorpAssetInput`
 * at the boundary, the same split `engine/corp/members.ts` makes for
 * `MemberActivity`.
 */
import {
  buildAssetGroups,
  nodeContribution,
  type AssetTreeContainerNode,
  type AssetTreeGroup,
  type AssetTreeNode,
  type EngineAsset,
} from '../assetTree';

/** The seven hangar divisions every corporation has, in order. */
export const HANGAR_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export type HangarDivisionNumber = (typeof HANGAR_DIVISIONS)[number];

/**
 * Corp asset rows carry four `location_flag` values a personal list never
 * sees, none of them one of the seven numbered divisions. Named rather than
 * left as raw strings so the view can give each one a fixed label instead of
 * printing ESI's flag verbatim.
 */
export type CorpAssetFlagKind = 'officeFolder' | 'corpDeliveries' | 'impounded' | 'assetSafety';

/**
 * `other` is the fallback for a `location_flag` this module has never heard
 * of — a CCP addition, or any flag that is neither `CorpSAGn` nor one of the
 * four named ones. Dropping an unrecognised row instead of bucketing it here
 * would silently vanish assets from the one page whose job is "what does the
 * corporation own" (CONTEXT.md round 44).
 */
export type CorpAssetGroupId = HangarDivisionNumber | CorpAssetFlagKind | 'other';

/** Fixed display order for the flag groups, applied after the seven divisions. */
const FLAG_GROUP_ORDER: readonly CorpAssetFlagKind[] = [
  'officeFolder',
  'corpDeliveries',
  'impounded',
  'assetSafety',
];

/**
 * Every `CorpAssetGroupId` this module knows about, in the fixed order
 * `buildCorpAssetTree` and `engine/corp/assetPath.ts`'s URL parser both need
 * — an 8th division or a new flag kind then only has to be added here.
 */
export const ALL_CORP_ASSET_GROUP_IDS: readonly CorpAssetGroupId[] = [
  ...HANGAR_DIVISIONS,
  ...FLAG_GROUP_ORDER,
  'other',
];

const HANGAR_FLAG_PATTERN = /^CorpSAG([1-7])$/;

const FLAG_KIND_BY_LOCATION_FLAG: Readonly<Record<string, CorpAssetFlagKind>> = {
  OfficeFolder: 'officeFolder',
  CorpDeliveries: 'corpDeliveries',
  Impounded: 'impounded',
  AssetSafety: 'assetSafety',
};

/** Which group a `location_flag` belongs in. Exported so a caller can sort or label ad hoc. */
export function corpAssetGroupId(locationFlag: string): CorpAssetGroupId {
  const hangarMatch = HANGAR_FLAG_PATTERN.exec(locationFlag);
  if (hangarMatch) return Number(hangarMatch[1]) as HangarDivisionNumber;
  return FLAG_KIND_BY_LOCATION_FLAG[locationFlag] ?? 'other';
}

/** What `features/corp/assets.ts` adapts each `CorporationAsset` into — structurally `EngineAsset` under different field names, the same split `toCharacterEngineAsset`-style boundary code makes elsewhere. */
export interface CorpAssetInput {
  itemId: number;
  typeId: number;
  quantity: number;
  locationId: number;
  locationType: EngineAsset['location_type'];
  locationFlag: string;
}

function toEngineAsset(asset: CorpAssetInput): EngineAsset {
  return {
    item_id: asset.itemId,
    type_id: asset.typeId,
    quantity: asset.quantity,
    location_id: asset.locationId,
    location_type: asset.locationType,
    location_flag: asset.locationFlag,
  };
}

/**
 * Sentinel `location_flag` for the synthetic node `buildCorpAssetTree` wraps
 * an office's contents in, keyed on the station/structure the office sits
 * at — never a real ESI flag, so it can never collide with one on the wire.
 */
export const CORP_ASSET_LOCATION_FLAG = '__corp-asset-location__';

/** The station/structure id a location-wrapper node stands for, or null for any other node. */
export function corpAssetLocationId(node: AssetTreeNode): number | null {
  return node.kind !== 'bay' && node.asset.location_flag === CORP_ASSET_LOCATION_FLAG
    ? -node.asset.item_id
    : null;
}

function locationNode(
  stationId: number,
  children: AssetTreeNode[],
  priceByTypeId: ReadonlyMap<number, number>
): AssetTreeContainerNode {
  let itemCount = 0;
  let estimatedValue = 0;
  for (const child of children) {
    const contribution = nodeContribution(child, priceByTypeId);
    itemCount += contribution.itemCount;
    estimatedValue += contribution.estimatedValue;
  }
  return {
    kind: 'container',
    asset: {
      // Negated: real item ids are always positive, so this can never
      // collide with a sibling asset's — segment/React keys are item_id alone.
      item_id: -stationId,
      type_id: 0,
      quantity: 0,
      location_id: stationId,
      location_type: 'station',
      location_flag: CORP_ASSET_LOCATION_FLAG,
    },
    children,
    itemCount,
    estimatedValue,
  };
}

/**
 * Wraps a group's office-derived roots by station. `buildAssetGroups` has
 * no such level — it groups roots by `groupIdFor` once and stops — so this
 * runs once more after, over roots already sorted into their real division.
 * A root that didn't come through an office stays exactly where
 * `buildAssetGroups` put it, unwrapped.
 */
function withLocationLevels(
  group: AssetTreeGroup<CorpAssetGroupId>,
  stationIdByItemId: ReadonlyMap<number, number>,
  priceByTypeId: ReadonlyMap<number, number>
): AssetTreeGroup<CorpAssetGroupId> {
  const byStation = new Map<number, AssetTreeNode[]>();
  const direct: AssetTreeNode[] = [];

  for (const node of group.children) {
    const stationId = node.kind === 'bay' ? undefined : stationIdByItemId.get(node.asset.item_id);
    if (stationId === undefined) {
      direct.push(node);
      continue;
    }
    const list = byStation.get(stationId) ?? [];
    list.push(node);
    byStation.set(stationId, list);
  }

  if (byStation.size === 0) return group;

  const locationNodes = [...byStation.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stationId, stationChildren]) => locationNode(stationId, stationChildren, priceByTypeId));

  return { ...group, children: [...locationNodes, ...direct] };
}

/**
 * The corp assets tree: divisions/flag groups as `buildAssetGroups`' top
 * axis, exactly `ALL_CORP_ASSET_GROUP_IDS`'s order. The seven hangar
 * divisions are always present even when empty ("seven hangar divisions as
 * the top axis" — the issue); the flag groups and `other` are the opposite,
 * appearing only when the corporation actually has something in them
 * (CONTEXT.md round 44). Beneath each root, a container/ship/bay recurses
 * exactly as `/assets`' own tree does — a container placed in a division
 * shows its contents nested inside it, not flag-bucketed separately.
 *
 * An office is a pass-through, not a bucket: it holds nothing of its own, so
 * its own row is dropped before grouping rather than bucketed under
 * `'officeFolder'` the way every other root would be. Its children keep
 * their own `location_id` pointing at the now-absent office item id, which
 * is exactly the condition `buildAssetGroups`' own orphan-rescue pass
 * already promotes to a root of its own — grouped by *its* real `CorpSAGn`
 * flag, which `buildNode` never reads at the top level otherwise. Each
 * promoted root is then wrapped in a location node named for the office's
 * own station, by `withLocationLevels`.
 */
export function buildCorpAssetTree(
  inputs: readonly CorpAssetInput[],
  priceByTypeId: ReadonlyMap<number, number> = new Map()
): AssetTreeGroup<CorpAssetGroupId>[] {
  const officeStationByItemId = new Map<number, number>();
  for (const input of inputs) {
    if (input.locationFlag === 'OfficeFolder') {
      officeStationByItemId.set(input.itemId, input.locationId);
    }
  }

  const stationIdByItemId = new Map<number, number>();
  const passThroughAssets: EngineAsset[] = [];
  for (const input of inputs) {
    if (input.locationFlag === 'OfficeFolder') continue;
    const stationId = officeStationByItemId.get(input.locationId);
    if (stationId !== undefined) stationIdByItemId.set(input.itemId, stationId);
    passThroughAssets.push(toEngineAsset(input));
  }

  const groups = buildAssetGroups(
    passThroughAssets,
    ALL_CORP_ASSET_GROUP_IDS,
    new Set(HANGAR_DIVISIONS),
    (asset) => corpAssetGroupId(asset.location_flag),
    priceByTypeId
  );

  return groups.map((group) => withLocationLevels(group, stationIdByItemId, priceByTypeId));
}
