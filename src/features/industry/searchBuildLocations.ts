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
 * Behind the `search` scope group: nobody who never opens a Build Plan is
 * asked at sign-in to let the app search their structures.
 */
import { getCharacterSearch } from '@/esi/endpoints';
import { loadStationSummary } from '@/features/character/stations';
import { loadStructureSummary } from '@/features/character/structures';
import { loadSystemName, loadSystemSecurity } from '@/features/character/systemSecurity';
import {
  buildStructureOptions,
  type BuildStructureOption,
  type LocatablePlace,
  type SystemSummary,
} from './buildStructures';

/** ESI's own floor. Below it the endpoint 400s, so it is never called. */
export const MIN_SEARCH_LENGTH = 3;

/**
 * Capped before any lookup, not after: a two-letter-common name can match
 * dozens of places, and each one resolved is a request. A pilot who cannot see
 * their structure in the first fifteen types more of its name.
 */
const MAX_RESULTS = 15;

export async function searchBuildLocations(
  characterId: number,
  query: string
): Promise<BuildStructureOption[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return [];

  const hits = (await getCharacterSearch(characterId, ['station', 'structure'], trimmed)).data;
  if (!hits) return [];

  const stationIds = (hits.station ?? []).slice(0, MAX_RESULTS);
  const structureIds = (hits.structure ?? []).slice(0, MAX_RESULTS);

  const places: LocatablePlace[] = [];
  const npcStationIds = new Set<number>();
  const resolved = await Promise.all([
    ...stationIds.map(async (id) => {
      const station = await loadStationSummary(id);
      if (station) npcStationIds.add(station.typeId);
      return station === null ? null : { id, ...toPlace(station) };
    }),
    // A 403 here is ordinary: the search is ACL-filtered but a structure can
    // leave the ACL between the two calls.
    ...structureIds.map(async (id) => {
      const structure = await loadStructureSummary(characterId, id);
      return structure === null ? null : { id, ...toPlace(structure) };
    }),
  ]);
  for (const place of resolved) if (place) places.push(place);

  const systems = new Map<number, SystemSummary>();
  await Promise.all(
    [...new Set(places.map((place) => place.systemId))].map(async (id) => {
      // One cached `/universe/systems/{id}` row answers both.
      const [name, security] = await Promise.all([loadSystemName(id), loadSystemSecurity(id)]);
      if (name !== null && security !== null) systems.set(id, { name, security });
    })
  );

  return buildStructureOptions(places, systems, (typeId) => npcStationIds.has(typeId)).slice(
    0,
    MAX_RESULTS
  );
}

function toPlace(summary: { name: string; systemId: number; typeId: number }) {
  return { name: summary.name, systemId: summary.systemId, typeId: summary.typeId };
}
