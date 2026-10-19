/** The pure half of `richnessOverride.ts`, free of Dexie and React so the advice worker can import it. */
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
