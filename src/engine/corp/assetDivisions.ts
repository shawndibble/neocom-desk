/**
 * Corp assets, grouped division-first (issue #330).
 *
 * `AssetTreeStation`/`AssetTreeNode` (`engine/assetTree.ts`) have no level
 * between a station and a container — division lives in `location_flag`
 * (`CorpSAG1`..`CorpSAG7`), and that engine's only `location_flag` grouping,
 * `bayKindFor`, returns null for every one of them. A corp assets surface
 * needs division as its top axis instead of a station/container tree, so it
 * gets its own grouping here rather than bolting a case onto the personal
 * tree (CONTEXT.md round 41).
 *
 * Pure (CLAUDE.md): no `fetch`/DOM/Dexie import, and no `@/esi/endpoints`
 * import either — `features/corp/assets.ts` adapts ESI's `CorporationAsset`
 * (snake_case, extra fields this grouping never uses) into `CorpAssetInput`
 * at the boundary, the same split `engine/corp/members.ts` makes for
 * `MemberActivity`.
 */

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
 * Every `CorpAssetGroupId` this module knows about, for a caller that needs
 * to validate one (`assetsExpandPreference.ts`'s stored-value parser) without
 * re-enumerating the union by hand — an 8th division or a new flag kind then
 * only has to be added here.
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

/** What `features/corp/assets.ts` adapts each `CorporationAsset` into. */
export interface CorpAssetInput {
  itemId: number;
  typeId: number;
  quantity: number;
  locationId: number;
  locationFlag: string;
}

/** One row inside a group. `locationFlag` is gone — the group it landed in already says that. */
export interface CorpAssetRow {
  itemId: number;
  typeId: number;
  quantity: number;
  locationId: number;
}

export interface CorpAssetGroup {
  id: CorpAssetGroupId;
  rows: CorpAssetRow[];
}

function toRow(asset: CorpAssetInput): CorpAssetRow {
  return {
    itemId: asset.itemId,
    typeId: asset.typeId,
    quantity: asset.quantity,
    locationId: asset.locationId,
  };
}

/**
 * Groups every asset by division, or by its special flag when it has one.
 *
 * The seven hangar divisions are always present, in order, even when a
 * corporation has nothing in one of them — "seven hangar divisions as the top
 * axis" (the issue) means seven, not however many happen to be occupied. The
 * flag groups and `other` are the opposite: sibling groups that appear only
 * when the corporation actually has something in them, in a fixed order after
 * the seven divisions (CONTEXT.md round 44).
 */
export function groupCorpAssets(assets: readonly CorpAssetInput[]): CorpAssetGroup[] {
  const rowsById = new Map<CorpAssetGroupId, CorpAssetRow[]>();
  for (const asset of assets) {
    const id = corpAssetGroupId(asset.locationFlag);
    const rows = rowsById.get(id);
    if (rows) rows.push(toRow(asset));
    else rowsById.set(id, [toRow(asset)]);
  }

  const groups: CorpAssetGroup[] = HANGAR_DIVISIONS.map((division) => ({
    id: division,
    rows: rowsById.get(division) ?? [],
  }));

  for (const flagKind of [...FLAG_GROUP_ORDER, 'other' as const]) {
    const rows = rowsById.get(flagKind);
    if (rows && rows.length > 0) groups.push({ id: flagKind, rows });
  }

  return groups;
}

/**
 * The same "resolved name, else the raw id" text the item column, the search
 * filter below, and the row context menu all print — one place so the three
 * cannot drift apart from each other.
 */
export function corpAssetItemName(typeId: number, typeNames: ReadonlyMap<number, string>): string {
  return typeNames.get(typeId) ?? `#${typeId}`;
}

/**
 * Search-time row filter (issue #420). Groups are never dropped, even to
 * zero rows — the view decides what a zero-row group means (a match found
 * elsewhere, or genuinely nothing here), this only narrows each group's rows.
 */
export function filterCorpAssetGroups(
  groups: readonly CorpAssetGroup[],
  typeNames: ReadonlyMap<number, string>,
  query: string
): CorpAssetGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...groups];
  return groups.map((group) => ({
    id: group.id,
    rows: group.rows.filter((row) =>
      corpAssetItemName(row.typeId, typeNames).toLowerCase().includes(q)
    ),
  }));
}
