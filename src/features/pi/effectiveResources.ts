import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiData, PiRawResource } from '@/sde/types';
import { localResourcesFor } from './systemPlanetModel';

export type RichnessByPlanet = ReadonlyMap<number, readonly number[]>;

export function effectiveLocalResources(
  planetType: PlanetType,
  pi: PiData,
  picked: readonly number[] | undefined,
  keep: readonly number[] = []
): PiRawResource[] {
  const local = localResourcesFor(planetType, pi);
  if (!picked || picked.length === 0) return local;
  const chosen = new Set(picked);
  if (!local.some((resource) => chosen.has(resource.typeID))) return local;
  for (const id of keep) chosen.add(id);
  return local.filter((resource) => chosen.has(resource.typeID));
}
