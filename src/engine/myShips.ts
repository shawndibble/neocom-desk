/**
 * "My ships": every ship an account owns, assembled or packaged (one row per
 * packaged stack), found in a flat asset list, nested ones included.
 *
 * Which type is a ship is the caller's call (SDE category lookup — pure
 * engines don't fetch). Ships inside a Ship Maintenance Bay or fleet hangar
 * are found the same way as any nested asset; the asset tree itself only
 * models Cargo, Drone and Fitting bays.
 *
 * Pure: no fetch/DOM/Dexie.
 */
import type { EngineAsset } from './assetTree';

export interface OwnedAsset extends EngineAsset {
  /** False for a stack of unassembled hulls; absent means assembled. */
  is_singleton?: boolean;
  characterId: number;
}

export interface ShipRow {
  itemId: number;
  typeId: number;
  characterId: number;
  /** The outermost location: the station, structure or solar system the ship sits in. */
  locationId: number;
  locationType: EngineAsset['location_type'];
  /** Inside another owned asset (a ship's hold, a container). */
  inCargo: boolean;
  /** Item ids of the owned assets holding this ship, outermost first. */
  trail: number[];
  /** `location_flag` of what each trail entry directly holds (the next holder, or this ship last): the bay or hold it sits in. One per trail entry. */
  holderFlags: string[];
  /** A stack of unassembled hulls (ESI `is_singleton === false`). */
  packaged: boolean;
  /** 1 for an assembled ship; the stack size for a packaged one. */
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
