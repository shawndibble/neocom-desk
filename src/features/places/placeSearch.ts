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

export interface PickedStation {
  id: number;
  name: string;
}

export interface KnownPlace {
  kind: 'station' | 'structure';
  id: number;
  name: string;
  systemId: number | null;
}

interface StationRow {
  id: number;
  name: string;
  systemId: number;
}

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
      const visible = characterId === null ? null : await loadVisibleStructure(characterId, hit.id);
      return visible === null ? null : { ...hit, name: visible.name, systemId: visible.systemId };
    })
  );
  return placed.filter((place) => place !== null);
}
