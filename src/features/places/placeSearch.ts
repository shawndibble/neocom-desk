/**
 * The place search Industry and Route Safety share (issue #4964): a station
 * or a player structure, found by name.
 *
 * Two ways in, for two costs:
 *
 *  - `resolvePlaceHits` turns the ids `GET /characters/{id}/search` answers
 *    with into places, one lookup per hit. A station's is a snapshot read; a
 *    structure's is ACL-checked and cached per Character. Industry's build
 *    location search runs on it, then applies its own "can host this
 *    activity" filter.
 *  - `searchKnownPlaces` ranks the NPC station snapshot and the structures
 *    this device already knows, with no ESI search at all — a typeahead that
 *    costs nothing per keystroke. Route Safety and the Move plan run on it.
 *
 * A structure the Character cannot see is dropped from either, never guessed.
 */
import { loadStationSummary } from '@/features/character/stations';
import {
  listCachedStructures,
  loadStructureSummary,
  loadVisibleStructure,
  type CachedStructure,
} from '@/features/character/structures';
import { rankedSearch } from '@/lib/rankedSearch';
import { loadNpcStations } from '@/sde/loadMarketSde';
import type { LocatablePlace } from '@/features/industry/buildLocations';

export async function resolvePlaceHits(
  characterId: number,
  wanted: readonly number[],
  stationIds: ReadonlySet<number>
): Promise<LocatablePlace[]> {
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
  return resolved.filter((place) => place !== null);
}

/** A station or structure picked from a search box. */
export interface PickedStation {
  id: number;
  name: string;
}

/** One station or structure a name matched. */
export interface KnownPlace {
  kind: 'station' | 'structure';
  id: number;
  name: string;
  /** Known for a station; `null` for a structure until it is resolved. */
  systemId: number | null;
}

interface StationRow {
  id: number;
  name: string;
  systemId: number;
}

/** Exact, then prefix, then substring, across stations and structures alike. */
export function rankKnownPlaces(
  query: string,
  stations: readonly StationRow[],
  structures: readonly CachedStructure[],
  limit: number
): KnownPlace[] {
  const candidates: KnownPlace[] = [
    ...stations.map((station): KnownPlace => ({ kind: 'station', ...station })),
    ...structures.map((structure): KnownPlace => ({
      kind: 'structure',
      ...structure,
      systemId: null,
    })),
  ];
  return rankedSearch(candidates, query, { primary: (place) => place.name, limit });
}

/**
 * Stations and known structures matching `query`, each with its system;
 * hidden structures dropped. With no Character there is no ACL to ask, so only
 * stations are offered.
 */
export async function searchKnownPlaces(
  characterId: number | null,
  query: string,
  limit: number
): Promise<(KnownPlace & { systemId: number })[]> {
  if (query.trim() === '') return [];
  const [stations, structures] = await Promise.all([
    loadNpcStations().catch(() => []),
    characterId === null ? [] : listCachedStructures().catch(() => []),
  ]);
  const hits = rankKnownPlaces(query, stations, structures, limit);
  const placed = await Promise.all(
    hits.map(async (hit) => {
      if (hit.systemId !== null) return { ...hit, systemId: hit.systemId };
      // The shared cache lists structures any Character on this device has seen:
      // only this Character's own ACL decides whether one is offered.
      const visible = characterId === null ? null : await loadVisibleStructure(characterId, hit.id);
      return visible === null ? null : { ...hit, name: visible.name, systemId: visible.systemId };
    })
  );
  return placed.filter((place) => place !== null);
}
