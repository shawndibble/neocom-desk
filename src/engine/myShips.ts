/**
 * "My ships": every assembled ship an account owns, found in a flat asset
 * list, nested ones included, then ordered nearest first.
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
}

export function findShips(
  assets: readonly OwnedAsset[],
  isShipType: (typeId: number) => boolean
): ShipRow[] {
  const byItemId = new Map(assets.map((a) => [a.item_id, a]));
  const rows: ShipRow[] = [];
  for (const ship of assets) {
    if (!isShipType(ship.type_id) || ship.is_singleton === false) continue;
    const trail: number[] = [];
    const seen = new Set([ship.item_id]);
    let locationId = ship.location_id;
    let locationType = ship.location_type;
    while (locationType === 'item') {
      const parent = byItemId.get(locationId);
      if (!parent || seen.has(parent.item_id)) break;
      seen.add(parent.item_id);
      trail.unshift(parent.item_id);
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
    });
  }
  return rows;
}

/** Fewest jumps first; undefined/null (not resolved, no route) sort last. Stable. */
export function sortShipsByJumps(
  rows: readonly ShipRow[],
  jumpsFor: (row: ShipRow) => number | null | undefined
): ShipRow[] {
  const key = (row: ShipRow) => jumpsFor(row) ?? Number.POSITIVE_INFINITY;
  return [...rows].sort((a, b) => key(a) - key(b));
}
