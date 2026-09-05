/**
 * Name search for the place a Build Plan's job runs: NPC stations and the
 * player structures this Character can dock at.
 *
 * `GET /characters/{id}/search` is the only ESI route that finds a structure by
 * name, and it answers with ids alone, so each hit costs one further lookup —
 * public and globally cached for a station, ACL-checked and per-character
 * cached for a structure. Both are `STALE_AFTER.static` rows shared with the
 * Assets tree, so searching for the same place twice costs one request.
 *
 * `esi-search.search_structures.v1` is in the base grant, so a Character added
 * since it was added can search straight away; one added before it holds a
 * token without it, and `BuildLocationPicker` offers the re-auth rather than
 * calling this and taking a 403.
 */
import { getCharacterSearch } from '@/esi/endpoints';
import { loadStationSummary } from '@/features/character/stations';
import { loadStructureSummary } from '@/features/character/structures';
import { loadSystemName, loadSystemSecurity } from '@/features/character/systemSecurity';
import type { IndustryActivity } from '@/engine/industry/types';
import {
  buildLocationOptions,
  type BuildLocationOption,
  type LocatablePlace,
  type SystemSummary,
} from './buildLocations';

/** ESI's own floor. Below it the endpoint 400s, so it is never called. */
export const MIN_SEARCH_LENGTH = 3;

/**
 * One cap across both categories, applied before any lookup: every id kept is
 * a further ESI request, and a common fragment matches dozens of places. The
 * two categories are interleaved rather than concatenated, so a name matching
 * forty NPC stations cannot crowd out the structure the pilot is looking for —
 * which capping per category, then truncating after the sort, did.
 */
const MAX_RESULTS = 15;

/** Alternates the two lists so neither can fill the cap on its own. */
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

  const resolved = await Promise.all(
    wanted.map(async (id): Promise<LocatablePlace | null> => {
      // A 403 on a structure is ordinary: the search is ACL-filtered, but a
      // structure can leave the ACL between the two calls.
      const summary = stationIds.has(id)
        ? await loadStationSummary(id)
        : await loadStructureSummary(characterId, id);
      return summary === null
        ? null
        : {
            id,
            name: summary.name,
            typeId: summary.typeId,
            systemId: summary.systemId,
            npcStation: stationIds.has(id),
          };
    })
  );
  const places = resolved.filter((place) => place !== null);

  const systems = new Map<number, SystemSummary>();
  await Promise.all(
    [...new Set(places.map((place) => place.systemId))].map(async (id) => {
      // One cached `/universe/systems/{id}` row answers both.
      const [name, security] = await Promise.all([loadSystemName(id), loadSystemSecurity(id)]);
      if (name !== null && security !== null) systems.set(id, { name, security });
    })
  );

  return buildLocationOptions(places, systems, activity);
}
