/**
 * The hole sizes a D-Scan's ships need, and their base hull mass (issue #5669).
 * Shown in wormhole space only.
 *
 * A hull heavier than a hole's per-jump limit can never pass it, so the size
 * a ship group needs is a fact; the mass total is a floor, since fittings,
 * prop mods and cargo cannot be seen. Neither says a fleet can pass a hole.
 *
 * Pure: the SDE lookups come in as `groupOf` and `massKgOf`.
 */
import { wormholeSizeForShipGroup } from '../route/hullWormholeSize';
import { WORMHOLE_SHIP_SIZES, type WormholeShipSize } from '../route/theraConnections';
import type { HullCount } from './dscanWorth';

export interface HoleSizeRead {
  /** Ships per smallest hole size they need, smallest first; empty sizes left out. */
  sizes: { size: WormholeShipSize; count: number }[];
  /** Ships whose group names no one size (Orca, barges, haulers) or is unknown. */
  unsized: number;
  /** Base hull mass of every ship with a baked mass, in kg. */
  massKg: number;
  /** Ships with no baked mass, so left out of `massKg`. */
  shipsWithoutMass: number;
}

/** The read for a scan's ship hulls, or null when it holds no ship. */
export function buildHoleSizes(
  hulls: readonly HullCount[],
  groupOf: (typeId: number) => number | undefined,
  massKgOf: (typeId: number) => number | undefined
): HoleSizeRead | null {
  if (hulls.length === 0) return null;
  const bySize = new Map<WormholeShipSize, number>();
  let unsized = 0;
  let massKg = 0;
  let shipsWithoutMass = 0;
  for (const { typeId, count } of hulls) {
    const groupId = groupOf(typeId);
    const size = groupId === undefined ? null : wormholeSizeForShipGroup(groupId);
    if (size === null) unsized += count;
    else bySize.set(size, (bySize.get(size) ?? 0) + count);
    const mass = massKgOf(typeId);
    if (mass === undefined) shipsWithoutMass += count;
    else massKg += mass * count;
  }
  return {
    sizes: WORMHOLE_SHIP_SIZES.flatMap((size) => {
      const count = bySize.get(size) ?? 0;
      return count > 0 ? [{ size, count }] : [];
    }),
    unsized,
    massKg,
    shipsWithoutMass,
  };
}
