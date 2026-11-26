import type { EngineAsset } from './assetTree';

export interface OwnedAsset extends EngineAsset {
  is_singleton?: boolean;
  characterId: number;
}

export interface ShipRow {
  itemId: number;
  typeId: number;
  characterId: number;
  locationId: number;
  locationType: EngineAsset['location_type'];
  inCargo: boolean;
  trail: number[];
  holderFlags: string[];
  packaged: boolean;
  quantity: number;
}

export function findShips(
  assets: readonly OwnedAsset[],
  isShipType: (typeId: number) => boolean
): ShipRow[] {
  const byItemId = new Map(assets.map((a) => [a.item_id, a]));
  const rows: ShipRow[] = [];
  for (const ship of assets) {
    if (!isShipType(ship.type_id)) continue;
    const trail: number[] = [];
    const holderFlags: string[] = [ship.location_flag];
    const seen = new Set([ship.item_id]);
    let locationId = ship.location_id;
    let locationType = ship.location_type;
    while (locationType === 'item') {
      const parent = byItemId.get(locationId);
      if (!parent || seen.has(parent.item_id)) break;
      seen.add(parent.item_id);
      trail.unshift(parent.item_id);
      holderFlags.unshift(parent.location_flag);
      locationId = parent.location_id;
      locationType = parent.location_type;
    }
    rows.push({
      itemId: ship.item_id,
      typeId: ship.type_id,
      characterId: ship.characterId,
      locationId,
      locationType,
      inCargo: trail.length > 0,
      trail,
      holderFlags: holderFlags.slice(1),
      packaged: ship.is_singleton === false,
      quantity: ship.is_singleton === false ? ship.quantity : 1,
    });
  }
  return rows;
}
