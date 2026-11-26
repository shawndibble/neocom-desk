import { wormholeSizeForShipGroup } from '../route/hullWormholeSize';
import { WORMHOLE_SHIP_SIZES, type WormholeShipSize } from '../route/theraConnections';
import type { HullCount } from './dscanWorth';

export interface HoleSizeRead {
  sizes: { size: WormholeShipSize; count: number }[];
  unsized: number;
  massKg: number;
  shipsWithoutMass: number;
}

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
