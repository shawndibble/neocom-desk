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
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type PlanetRichnessRecord } from '@/db';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiData, PiRawResource } from '@/sde/types';
import { localResourcesFor } from './systemPlanetModel';

/** Saved picks by planet id, each richest-first or in tick order (only membership matters). */
export type RichnessByPlanet = ReadonlyMap<number, readonly number[]>;

/** The P0s a planet of `planetType` is advised on: the picked ones it yields, else all it yields. */
export function effectiveLocalResources(
  planetType: PlanetType,
  pi: PiData,
  picked: readonly number[] | undefined,
  /** Resources kept when the pick narrows (what the colony extracts today). */
  keep: readonly number[] = []
): PiRawResource[] {
  const local = localResourcesFor(planetType, pi);
  if (!picked || picked.length === 0) return local;
  const chosen = new Set(picked);
  if (!local.some((resource) => chosen.has(resource.typeID))) return local;
  for (const id of keep) chosen.add(id);
  return local.filter((resource) => chosen.has(resource.typeID));
}

/**
 * The character's saved picks, live: a toggle on the Map recomputes every tab
 * with no reload. Null until the first read, so callers hold as loading rather
 * than flash un-overridden figures.
 */
export function usePlanetRichness(characterId: number | null): RichnessByPlanet | null {
  const rows = useLiveQuery(
    async (): Promise<PlanetRichnessRecord[]> =>
      characterId === null
        ? []
        : db.planetRichness.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
  return useMemo(
    () => (rows === undefined ? null : new Map(rows.map((row) => [row.planetId, row.order]))),
    [rows]
  );
}
