import type { MoveHullOwnedAt } from '@/engine/assets/movePlan';
import type { MovePlanSource } from './movePlanInput';

/** One assembled copy of a hull, at a top-level station or structure. */
export interface OwnedHullCopy {
  typeId: number;
  characterId: number;
  characterName: string;
  locationId: number;
  locationType: 'station' | 'structure';
}

/** Assembled copies of `hullTypeIds`; a ship in a container or in space has no place to name. */
export function ownedHullCopies(
  sources: readonly MovePlanSource[],
  hullTypeIds: ReadonlySet<number>
): OwnedHullCopy[] {
  const copies: OwnedHullCopy[] = [];
  for (const { characterId, name, assets } of sources) {
    for (const a of assets) {
      if (!a.is_singleton || !hullTypeIds.has(a.type_id)) continue;
      if (a.location_type === 'item' || a.location_type === 'solar_system') continue;
      copies.push({
        typeId: a.type_id,
        characterId,
        characterName: name,
        locationId: a.location_id,
        locationType: a.location_type === 'station' ? 'station' : 'structure',
      });
    }
  }
  return copies;
}

/**
 * The nearest copy of each hull: fewest jumps from the character it is
 * nearest to. A known count beats an unknown one; a copy whose system did not
 * resolve is left out, and so is a hull with none left.
 */
export function nearestOwnedHulls(
  copies: readonly OwnedHullCopy[],
  systemOf: ReadonlyMap<number, number | null>,
  jumps: (characterId: number, systemId: number) => number | null
): Map<number, MoveHullOwnedAt> {
  const best = new Map<number, MoveHullOwnedAt>();
  for (const c of copies) {
    const systemId = systemOf.get(c.locationId);
    if (systemId == null) continue;
    const candidate = {
      systemId,
      jumps: jumps(c.characterId, systemId),
      characterName: c.characterName,
    };
    const current = best.get(c.typeId);
    if (
      !current ||
      (candidate.jumps !== null && (current.jumps === null || candidate.jumps < current.jumps))
    ) {
      best.set(c.typeId, candidate);
    }
  }
  return best;
}
