import { getCharacterSearch } from '@/esi/endpoints';
import { resolvePlaceHits } from '@/features/places/placeSearch';
import { loadSystemName, loadSystemSecurity } from '@/features/character/systemSecurity';
import type { IndustryActivity } from '@/engine/industry/types';
import {
  buildLocationOptions,
  type BuildLocationOption,
  type SystemSummary,
} from './buildLocations';

export const MIN_SEARCH_LENGTH = 3;

const MAX_RESULTS = 15;

function interleave(stations: readonly number[], structures: readonly number[]): number[] {
  const ids: number[] = [];
  for (let i = 0; i < Math.max(stations.length, structures.length); i += 1) {
    if (i < structures.length) ids.push(structures[i]);
    if (i < stations.length) ids.push(stations[i]);
  }
  return ids;
}

export async function searchBuildLocations(
  characterId: number,
  query: string,
  activity: IndustryActivity,
  signal?: AbortSignal
): Promise<BuildLocationOption[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return [];

  const hits = (
    await getCharacterSearch(characterId, ['station', 'structure'], trimmed, { signal })
  ).data;
  if (!hits) return [];

  const stationIds = new Set(hits.station ?? []);
  const wanted = interleave(hits.station ?? [], hits.structure ?? []).slice(0, MAX_RESULTS);

  const places = await resolvePlaceHits(characterId, wanted, stationIds);

  const systems = new Map<number, SystemSummary>();
  await Promise.all(
    [...new Set(places.map((place) => place.systemId))].map(async (id) => {
      const [name, security] = await Promise.all([loadSystemName(id), loadSystemSecurity(id)]);
      if (name !== null && security !== null) systems.set(id, { name, security });
    })
  );

  return buildLocationOptions(places, systems, activity);
}
