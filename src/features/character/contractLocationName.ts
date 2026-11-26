import { loadWithCache, STALE_AFTER } from '@/esi/cache';
import { lookupNpcStation } from '@/sde/npcStations';
import { loadStationName, loadStationSystemId } from './stations';
import { loadStructureName, loadStructureSystemId } from './structures';
import { loadSystemName } from './systemSecurity';

function cacheKey(locationId: number): string {
  return `contract-location:${locationId}`;
}

export async function loadContractLocationName(
  characterId: number,
  locationId: number
): Promise<string | null> {
  const result = await loadWithCache(
    characterId,
    cacheKey(locationId),
    async () => {
      const snapshot = await lookupNpcStation(locationId);
      if (snapshot) return snapshot.name;
      if (snapshot === null) return loadStructureName(characterId, locationId);
      const stationName = await loadStationName(locationId);
      if (stationName) return stationName;
      return loadStructureName(characterId, locationId);
    },
    { staleAfterMs: STALE_AFTER.static }
  );
  return result?.data ?? null;
}

export async function loadContractSystemName(
  characterId: number,
  locationId: number
): Promise<string | null> {
  const snapshot = await lookupNpcStation(locationId);
  const systemId =
    snapshot === null
      ? await loadStructureSystemId(characterId, locationId)
      : ((await loadStationSystemId(locationId)) ??
        (await loadStructureSystemId(characterId, locationId)));
  return systemId ? loadSystemName(systemId) : null;
}
