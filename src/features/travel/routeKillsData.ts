/**
 * What Route Safety's zKillboard column reads (issue #2329): each route
 * system's player kills from the last hour, the names of the stargates and
 * stations they happened at, and every type's group for the bubble and
 * smartbomb tags.
 *
 * zKillboard answers one system per request, so these are fetched per system
 * at low concurrency by the caller and cached here for five minutes each.
 * A failure (429 included) is not cached: the next look simply asks again.
 *
 * Locations: `/universe/names` cannot name a stargate or a celestial — ESI
 * rejects the whole batch — so a stargate is read from
 * `/universe/stargates/{id}`, which also says which system it leads to. That
 * is what "on your path" is matched against: an id, not a name. NPC stations
 * come from the local snapshot at no cost. Planets, moons, belts and player
 * structures stay unnamed.
 */
import { getUniverseStargate } from '@/esi/endpoints';
import type { ResolvedLocation } from '@/engine/route/recentKills';
import { fetchSystemRecentKills, type SystemRecentKillsResult } from '@/lib/zkillboard';
import { loadTypes } from '@/sde/loadSde';
import { lookupNpcStation } from '@/sde/npcStations';

export const RECENT_KILLS_TTL_MS = 5 * 60_000;

const STARGATE_MIN = 50_000_000;
const STARGATE_MAX = 59_999_999;
const STATION_MIN = 60_000_000;
const STATION_MAX = 69_999_999;

const killsCache = new Map<number, { at: number; result: SystemRecentKillsResult }>();
/** Stargates never change, so each one is read once per session. */
const stargateCache = new Map<number, Promise<ResolvedLocation | null>>();

/** Never rejects; `{ ok: false }` when zKillboard failed or rate-limited. */
export async function loadSystemRecentKills(
  systemId: number,
  now: number = Date.now()
): Promise<SystemRecentKillsResult> {
  const cached = killsCache.get(systemId);
  if (cached && now - cached.at < RECENT_KILLS_TTL_MS) return cached.result;
  const result = await fetchSystemRecentKills(systemId);
  if (result.ok) killsCache.set(systemId, { at: now, result });
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
    // A failed read is forgotten, so a later look can try again.
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

/** Never rejects: a location that cannot be named is simply absent from the map. */
export async function resolveKillLocations(
  locationIds: readonly number[]
): Promise<ReadonlyMap<number, ResolvedLocation>> {
  const resolved = new Map<number, ResolvedLocation>();
  await Promise.all(
    [...new Set(locationIds)].map(async (id) => {
      const location =
        id >= STARGATE_MIN && id <= STARGATE_MAX
          ? await resolveStargate(id)
          : id >= STATION_MIN && id <= STATION_MAX
            ? await resolveStation(id)
            : null;
      if (location) resolved.set(id, location);
    })
  );
  return resolved;
}

/** A type → group lookup from the SDE; every type unknown when it cannot be read. */
export async function loadTypeGroups(): Promise<(typeId: number) => number | undefined> {
  const types = await loadTypes().catch(() => null);
  return (typeId) => types?.[String(typeId)]?.groupID;
}

/** For tests. */
export function clearRouteKillCaches(): void {
  killsCache.clear();
  stargateCache.clear();
}
