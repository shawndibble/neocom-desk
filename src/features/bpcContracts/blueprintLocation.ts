/**
 * Resolves a `location_id` (an owned blueprint's, or a public BPC contract's)
 * to a name plus this app's four-way space classification (issue #796) —
 * reusing the station/structure resolvers `contractLocationName.ts` and
 * `ownedStockDetection.ts` already share, rather than writing a second
 * resolver.
 *
 * `lookupSolarSystem` (`src/sde/solarSystems.ts`) answers a resolved system's
 * region id and raw security status with no further ESI request — the whole
 * `systems.json` snapshot is already loaded for wormhole/space
 * classification, so region comes along for free.
 */
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
}

const UNRESOLVED: ResolvedLocation = { name: null, regionId: null, space: null };

async function withSystem(systemId: number | null, name: string | null): Promise<ResolvedLocation> {
  if (systemId == null) return { name, regionId: null, space: null };
  const system = await lookupSolarSystem(systemId);
  if (!system) return { name, regionId: null, space: null };
  return {
    name: name ?? system.name,
    regionId: system.regionId,
    space: classifySpace(system.name, system.security),
  };
}

function cacheKey(locationId: number): string {
  return `bpc-blueprint-location:${locationId}`;
}

/**
 * An owned blueprint's location, name/region/space, for a specific character
 * (a player structure's ACL is per-character). Cached per character +
 * location — a station or structure can be renamed, but rarely, and the
 * point of caching is not paying a fresh fan-out per open (same trade
 * `contractLocationName.ts` makes).
 */
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
        // Loaded, and this id is not in it: a player structure, definitively.
        const [name, systemId] = await Promise.all([
          loadStructureName(characterId, locationId),
          loadStructureSystemId(characterId, locationId),
        ]);
        return withSystem(systemId, name);
      }
      // No snapshot to decide with — the station-then-structure probe.
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
}

const UNRESOLVED_CONTRACT_LOCATION: ContractLocationInfo = { name: null, space: null };

/**
 * A public BPC contract's location, name/space only — no region (the contract
 * row already carries its own `regionId` from the sync, ADR 0013). Resolves
 * through the free SDE snapshot only: a public contract's station is
 * typically an NPC trade hub, resolvable with zero ESI calls, and a contract
 * sitting at a player structure has no single character whose ACL it should
 * be checked against (ADR 0013 deliberately deferred exact-location
 * resolution for this reason) — such a row's location/space stays
 * unresolved (`null`) rather than firing an ESI request that would usually
 * 403.
 */
export async function loadContractLocationInfo(locationId: number): Promise<ContractLocationInfo> {
  const snapshot = await lookupNpcStation(locationId);
  if (!snapshot) return UNRESOLVED_CONTRACT_LOCATION;
  const system = await lookupSolarSystem(snapshot.systemId);
  if (!system) return { name: snapshot.name, space: null };
  return { name: snapshot.name, space: classifySpace(system.name, system.security) };
}
