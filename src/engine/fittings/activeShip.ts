import type { EngineAsset } from '../assetTree';
import { shipAssetItem, type ShipAssetItem } from './assetShipMapper';

export function activeShipItems(
  assets: readonly EngineAsset[],
  shipItemId: number
): ShipAssetItem[] {
  return assets
    .filter((asset) => asset.location_type === 'item' && asset.location_id === shipItemId)
    .map(shipAssetItem);
}

const CAPSULE_GROUP_ID = 29;

export function isCapsuleGroup(groupId: number | undefined): boolean {
  return groupId === CAPSULE_GROUP_ID;
}
