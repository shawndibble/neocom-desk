/**
 * Appraisal "minus owned": what a pasted pile still needs once the stock a
 * pilot already holds at one station is taken off. Pure — the caller fetches
 * the assets. Fittings' Copy multibuy reuses `subtractOwned` (#2829).
 *
 * Scope is station hangars only: an asset whose `location_type` is `station`
 * and whose `location_id` is the chosen station. Containers and corp hangars
 * are out of v1.
 */

export interface OwnedAsset {
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: string;
}

/** Quantity per type id held at `stationId`, summed over every Character's asset list. */
export function ownedAtStation(
  assetLists: readonly (readonly OwnedAsset[])[],
  stationId: number
): Map<number, number> {
  const owned = new Map<number, number>();
  for (const assets of assetLists) {
    for (const asset of assets) {
      if (asset.location_type !== 'station' || asset.location_id !== stationId) continue;
      owned.set(asset.type_id, (owned.get(asset.type_id) ?? 0) + asset.quantity);
    }
  }
  return owned;
}

export type WithOwned<T> = T & {
  /** Held units, capped at `quantity`: the part of the line already covered. */
  owned: number;
  /** Units still to buy; 0 when the line is fully covered. */
  need: number;
};

export function subtractOwned<T extends { typeId: number; quantity: number }>(
  items: readonly T[],
  owned: ReadonlyMap<number, number>
): WithOwned<T>[] {
  return items.map((item) => {
    const held = Math.min(owned.get(item.typeId) ?? 0, item.quantity);
    return { ...item, owned: held, need: item.quantity - held };
  });
}
