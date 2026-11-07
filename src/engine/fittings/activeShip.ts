/**
 * The Active Fit: the ship a Character is flying, read off their assets. ESI
 * has no "current fit" call, so the fitted modules, charges, drones and cargo
 * are the assets whose location is the flown ship's item id. Assets refresh
 * about hourly, so after a refit or a ship swap these lag the game.
 */
import type { EngineAsset } from '../assetTree';
import { shipAssetItem, type ShipAssetItem } from './assetShipMapper';

/** The assets inside the flown ship; empty when the assets haven't caught up with it yet. */
export function activeShipItems(
  assets: readonly EngineAsset[],
  shipItemId: number
): ShipAssetItem[] {
  return assets
    .filter((asset) => asset.location_type === 'item' && asset.location_id === shipItemId)
    .map(shipAssetItem);
}

/** SDE group of every Capsule (pod) hull. */
const CAPSULE_GROUP_ID = 29;

/** A pod has nothing to fit, so it is never an Active Fit. */
export function isCapsuleGroup(groupId: number | undefined): boolean {
  return groupId === CAPSULE_GROUP_ID;
}
