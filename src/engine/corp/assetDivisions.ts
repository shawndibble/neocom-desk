/**
 * Corp asset types and the `location_flag` -> group mapping `engine/industry/ownedStock.ts`
 * still reads. The division-first tree this module once built was replaced by the inventory
 * ledger (`assetLedger.ts`, issue #4671).
 *
 * Pure (CLAUDE.md): no `fetch`/DOM/Dexie import, and no `@/esi/endpoints`
 * import either — `features/corp/assets.ts` adapts ESI's `CorporationAsset`
 * into `CorpAssetInput` at the boundary.
 */

import type { EngineAsset } from '../assetTree';

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
 * corporation own" (GLOSSARY.md round 44).
 */
export type CorpAssetGroupId = HangarDivisionNumber | CorpAssetFlagKind | 'other';

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
  /** Carried so a copy is valued per item, not at its original's type price (`assetStackValue`). */
  isBlueprintCopy?: boolean;
  /** ESI `is_singleton`: assembled (true) vs packaged (false). Absent when the source does not say. */
  isSingleton?: boolean;
}
