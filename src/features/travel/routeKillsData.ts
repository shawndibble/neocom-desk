import { getUniverseStargate } from '@/esi/endpoints';
import { isNpcStationId, isStargateId } from '@/esi/locationIds';
import type { ResolvedLocation } from '@/engine/route/recentKills';
import {
  fetchRegionRecentKills,
  fetchSystemRecentKills,
  type RegionRecentKillsResult,
  type SystemRecentKillsResult,
} from '@/lib/zkillboard';
import { loadTypes } from '@/sde/loadSde';
import { lookupNpcStation } from '@/sde/npcStations';
import { MINUTE_MS } from '@/lib/age';

export const RECENT_KILLS_TTL_MS = 5 * MINUTE_MS;

const killsCache = new Map<number, { at: number; result: Promise<SystemRecentKillsResult> }>();
const regionCache = new Map<number, { at: number; result: Promise<RegionRecentKillsResult> }>();
const stargateCache = new Map<number, Promise<ResolvedLocation | null>>();

export async function loadSystemRecentKills(
  systemId: number,
  now: number = Date.now()
): Promise<SystemRecentKillsResult> {
  const cached = killsCache.get(systemId);
  if (cached && now - cached.at < RECENT_KILLS_TTL_MS) return cached.result;
  const entry = { at: now, result: fetchSystemRecentKills(systemId) };
  killsCache.set(systemId, entry);
  const result = await entry.result;
  if (!result.ok && killsCache.get(systemId) === entry) killsCache.delete(systemId);
  return result;
}

export async function loadRegionRecentKills(
  regionId: number,
  now: number = Date.now()
): Promise<RegionRecentKillsResult> {
  const cached = regionCache.get(regionId);
  if (cached && now - cached.at < RECENT_KILLS_TTL_MS) return cached.result;
  const entry = { at: now, result: fetchRegionRecentKills(regionId) };
  regionCache.set(regionId, entry);
  const result = await entry.result;
  if (!result.ok && regionCache.get(regionId) === entry) regionCache.delete(regionId);
  return result;
}

function resolveStargate(stargateId: number): Promise<ResolvedLocation | null> {
  let pending = stargateCache.get(stargateId);
  if (!pending) {
    pending = getUniverseStargate(stargateId).then(
      ({ data }): ResolvedLocation | null =>
        data
          ? {
              kind: 'stargate',
              name: data.name,
              destinationSystemId: data.destination.system_id,
            }
          : null,
      () => null
    );
    void pending.then((location) => {
      if (location === null) stargateCache.delete(stargateId);
    });
    stargateCache.set(stargateId, pending);
  }
  return pending;
}

async function resolveStation(stationId: number): Promise<ResolvedLocation | null> {
  const station = await lookupNpcStation(stationId).catch(() => undefined);
  return station ? { kind: 'station', name: station.name } : null;
}

export async function resolveKillLocations(
  locationIds: readonly number[]
): Promise<ReadonlyMap<number, ResolvedLocation>> {
  const resolved = new Map<number, ResolvedLocation>();
  await Promise.all(
    [...new Set(locationIds)].map(async (id) => {
      const location = isStargateId(id)
        ? await resolveStargate(id)
        : isNpcStationId(id)
          ? await resolveStation(id)
          : null;
      if (location) resolved.set(id, location);
    })
  );
  return resolved;
}

export async function loadTypeGroups(): Promise<(typeId: number) => number | undefined> {
  const types = await loadTypes().catch(() => null);
  return (typeId) => types?.[String(typeId)]?.groupID;
}

export function clearRouteKillCaches(): void {
  killsCache.clear();
  regionCache.clear();
  stargateCache.clear();
}
