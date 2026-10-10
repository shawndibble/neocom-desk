/**
 * The places a Survey's location can name: the ones ESI's waypoint call takes
 * (a solar system, an NPC station or a player structure). Asteroid belts and ice
 * fields are celestials the call refuses, so the system is as close as a Survey
 * gets to one.
 *
 * Systems and NPC stations come from the local snapshot, so typing costs no ESI
 * request. Only a structure needs one (`GET /characters/{id}/search`, which
 * answers with ids alone, so each hit is a further ACL-checked lookup).
 */
import { getCharacterSearch } from '@/esi/endpoints';
import { loadStructureSummary } from '@/features/character/structures';
import { rankedSearch } from '@/lib/rankedSearch';
import type { NpcStationEntry, SolarSystemEntry } from '@/sde/marketTypes';

export type SurveyPlaceKind = 'system' | 'station' | 'structure';

export interface SurveyPlace {
  id: number;
  name: string;
  kind: SurveyPlaceKind;
  /** Systems only, for the security tag beside the name. */
  security?: number;
}

/** ESI's own floor: below it the search endpoint 400s, so it is never called. */
export const MIN_STRUCTURE_SEARCH_LENGTH = 3;

const SYSTEM_LIMIT = 5;
const STATION_LIMIT = 4;
const STRUCTURE_LIMIT = 4;

/** Systems first (the usual pick for ice and asteroids), then NPC stations. */
export function searchLocalPlaces(
  systems: readonly SolarSystemEntry[],
  stations: readonly NpcStationEntry[],
  query: string
): SurveyPlace[] {
  const foundSystems = rankedSearch(systems, query, {
    primary: (s) => s.name,
    limit: SYSTEM_LIMIT,
  }).map((s): SurveyPlace => ({ id: s.id, name: s.name, kind: 'system', security: s.security }));
  const foundStations = rankedSearch(stations, query, {
    primary: (s) => s.name,
    limit: STATION_LIMIT,
  }).map((s): SurveyPlace => ({ id: s.id, name: s.name, kind: 'station' }));
  return [...foundSystems, ...foundStations];
}

/** The structures this Character can dock at whose name matches. A refused or failed lookup is just fewer results. */
export async function searchStructures(
  characterId: number,
  query: string,
  signal?: AbortSignal
): Promise<SurveyPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_STRUCTURE_SEARCH_LENGTH) return [];
  const hits = (await getCharacterSearch(characterId, ['structure'], trimmed, { signal })).data;
  const ids = (hits?.structure ?? []).slice(0, STRUCTURE_LIMIT);
  const resolved = await Promise.all(
    ids.map(async (id): Promise<SurveyPlace | null> => {
      const summary = await loadStructureSummary(characterId, id).catch(() => null);
      return summary === null ? null : { id, name: summary.name, kind: 'structure' };
    })
  );
  return resolved.filter((place) => place !== null);
}
