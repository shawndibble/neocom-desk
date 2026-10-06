/**
 * The pilot's own pick of which P0s they would pull on a planet (issue #2685;
 * `PlanetRichnessRecord`, written by `setPlanetRichness`). ESI carries no
 * richness, so the pick is the only statement the pilot can make: "these, not
 * those". It narrows the resources a colony's advice is scored against.
 *
 * No pick, an empty pick, or a pick naming nothing this planet type yields
 * (a stale typeID, an old save) means no narrowing, so a saved override can
 * never leave a planet with nothing to advise on, and none needs migrating.
 */
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiData, PiRawResource } from '@/sde/types';
import { localResourcesFor } from './advisorModel';

/** Saved picks by planet id, each richest-first or in tick order (only membership matters). */
export type RichnessByPlanet = ReadonlyMap<number, readonly number[]>;

/** The P0s a planet of `planetType` is advised on: the picked ones it yields, else all it yields. */
export function effectiveLocalResources(
  planetType: PlanetType,
  pi: PiData,
  picked: readonly number[] | undefined
): PiRawResource[] {
  const local = localResourcesFor(planetType, pi);
  if (!picked || picked.length === 0) return local;
  const chosen = new Set(picked);
  const narrowed = local.filter((resource) => chosen.has(resource.typeID));
  return narrowed.length > 0 ? narrowed : local;
}
