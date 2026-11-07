/**
 * The Active Fit: the ship a Character is flying, read off their assets. ESI
 * has no "current fit" call, so the fitted modules, charges, drones and cargo
 * are the assets whose location is the flown ship's item id. Assets refresh
 * about hourly, so after a refit or a ship swap these lag the game.
 */
import type { ShipAssetItem } from './assetShipMapper';

/** The asset fields this reads (ESI's `CharacterAsset` has more). */
export interface ActiveShipAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: string;
  location_flag: string;
}

/** The assets inside the flown ship; empty when the assets haven't caught up with it yet. */
export function activeShipItems(
  assets: readonly ActiveShipAsset[],
  shipItemId: number
): ShipAssetItem[] {
  return assets
    .filter((asset) => asset.location_type === 'item' && asset.location_id === shipItemId)
    .map((asset) => ({
      typeId: asset.type_id,
      quantity: asset.quantity,
      flag: asset.location_flag,
      itemId: asset.item_id,
    }));
}

/** SDE group of every Capsule (pod) hull. */
const CAPSULE_GROUP_ID = 29;

/** A pod has nothing to fit, so it is never an Active Fit. */
export function isCapsuleGroup(groupId: number | undefined): boolean {
  return groupId === CAPSULE_GROUP_ID;
}
