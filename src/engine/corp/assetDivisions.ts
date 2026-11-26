import type { EngineAsset } from '../assetTree';

export const HANGAR_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export type HangarDivisionNumber = (typeof HANGAR_DIVISIONS)[number];

export type CorpAssetFlagKind = 'officeFolder' | 'corpDeliveries' | 'impounded' | 'assetSafety';

export type CorpAssetGroupId = HangarDivisionNumber | CorpAssetFlagKind | 'other';

const HANGAR_FLAG_PATTERN = /^CorpSAG([1-7])$/;

const FLAG_KIND_BY_LOCATION_FLAG: Readonly<Record<string, CorpAssetFlagKind>> = {
  OfficeFolder: 'officeFolder',
  CorpDeliveries: 'corpDeliveries',
  Impounded: 'impounded',
  AssetSafety: 'assetSafety',
};

export function corpAssetGroupId(locationFlag: string): CorpAssetGroupId {
  const hangarMatch = HANGAR_FLAG_PATTERN.exec(locationFlag);
  if (hangarMatch) return Number(hangarMatch[1]) as HangarDivisionNumber;
  return FLAG_KIND_BY_LOCATION_FLAG[locationFlag] ?? 'other';
}

export interface CorpAssetInput {
  itemId: number;
  typeId: number;
  quantity: number;
  locationId: number;
  locationType: EngineAsset['location_type'];
  locationFlag: string;
  isBlueprintCopy?: boolean;
  isSingleton?: boolean;
}
