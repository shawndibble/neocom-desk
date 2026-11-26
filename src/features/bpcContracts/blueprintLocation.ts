import { loadWithCache, STALE_AFTER } from '@/esi/cache';
import { classifySpace, type SpaceKind } from '@/engine/space';
import { lookupNpcStation } from '@/sde/npcStations';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { loadStationName, loadStationSystemId } from '@/features/character/stations';
import { loadStructureName, loadStructureSystemId } from '@/features/character/structures';

export interface ResolvedLocation {
  name: string | null;
  regionId: number | null;
  space: SpaceKind | null;
  systemId: number | null;
}

const UNRESOLVED: ResolvedLocation = { name: null, regionId: null, space: null, systemId: null };

async function withSystem(systemId: number | null, name: string | null): Promise<ResolvedLocation> {
  if (systemId == null) return { name, regionId: null, space: null, systemId: null };
  const system = await lookupSolarSystem(systemId);
  if (!system) return { name, regionId: null, space: null, systemId };
  return {
    name: name ?? system.name,
    regionId: system.regionId,
    space: classifySpace(system.name, system.security),
    systemId,
  };
}

function cacheKey(locationId: number): string {
  return `bpc-blueprint-location:v2:${locationId}`;
}

export async function loadBlueprintLocation(
  characterId: number,
  locationId: number
): Promise<ResolvedLocation> {
  const result = await loadWithCache(
    characterId,
    cacheKey(locationId),
    async () => {
      const snapshot = await lookupNpcStation(locationId);
      if (snapshot) return withSystem(snapshot.systemId, snapshot.name);
      if (snapshot === null) {
        const [name, systemId] = await Promise.all([
          loadStructureName(characterId, locationId),
          loadStructureSystemId(characterId, locationId),
        ]);
        return withSystem(systemId, name);
      }
      const stationName = await loadStationName(locationId);
      if (stationName) return withSystem(await loadStationSystemId(locationId), stationName);
      const [name, systemId] = await Promise.all([
        loadStructureName(characterId, locationId),
        loadStructureSystemId(characterId, locationId),
      ]);
      return withSystem(systemId, name);
    },
    { staleAfterMs: STALE_AFTER.static }
  );
  return result?.data ?? UNRESOLVED;
}

export interface ContractLocationInfo {
  name: string | null;
  space: SpaceKind | null;
  systemId: number | null;
}

const UNRESOLVED_CONTRACT_LOCATION: ContractLocationInfo = {
  name: null,
  space: null,
  systemId: null,
};

export async function loadContractLocationInfo(locationId: number): Promise<ContractLocationInfo> {
  const snapshot = await lookupNpcStation(locationId);
  if (!snapshot) return UNRESOLVED_CONTRACT_LOCATION;
  const system = await lookupSolarSystem(snapshot.systemId);
  if (!system) return { name: snapshot.name, space: null, systemId: snapshot.systemId };
  return {
    name: snapshot.name,
    space: classifySpace(system.name, system.security),
    systemId: snapshot.systemId,
  };
}
