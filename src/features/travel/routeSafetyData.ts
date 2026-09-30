/**
 * What Route Safety reads besides the stargate graph (issue #2328): the last
 * hour of kills and jumps for the whole universe, and region names.
 *
 * Both activity feeds are one public call each for all of New Eden, so a
 * route of any length costs two requests — never one per system (decision
 * `20260912-165245`). They are cached globally rather than per Character:
 * the answer is the same for everyone. ESI refreshes them about hourly, so a
 * revalidation inside that hour is a cheap 304.
 */
import {
  conditionalFetch,
  GLOBAL_CACHE_CHARACTER_ID,
  loadWithCache,
  type CachedResult,
} from '@/esi/cache';
import { getUniverseSystemJumps, getUniverseSystemKills, postUniverseNames } from '@/esi/endpoints';
import {
  indexSystemJumps,
  indexSystemKills,
  type SystemKills,
  type SystemJumpsEntry,
  type SystemKillsEntry,
} from '@/engine/route/routeSafety';
import { loadMarketRegions } from '@/sde/loadMarketSde';

const KILLS_CACHE_KEY = 'universe-system-kills';
const JUMPS_CACHE_KEY = 'universe-system-jumps';

export interface SystemActivity {
  /** `null` when the feed could not be read and nothing was cached. */
  kills: ReadonlyMap<number, SystemKills> | null;
  jumps: ReadonlyMap<number, number> | null;
  /** The older of the two feeds' ages, or `null` when neither arrived. */
  fetchedAt: Date | null;
}

async function loadFeed<T>(
  key: string,
  fetch: Parameters<typeof conditionalFetch<T>>[0]
): Promise<CachedResult<T> | null> {
  const { fetchLive, conditional } = conditionalFetch(fetch);
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, key, fetchLive, { conditional }).catch(
    () => null
  );
}

/** Never rejects: a feed that cannot be read comes back `null`, never empty. */
export async function loadSystemActivity(): Promise<SystemActivity> {
  const [kills, jumps] = await Promise.all([
    loadFeed<SystemKillsEntry[]>(KILLS_CACHE_KEY, (options) => getUniverseSystemKills(options)),
    loadFeed<SystemJumpsEntry[]>(JUMPS_CACHE_KEY, (options) => getUniverseSystemJumps(options)),
  ]);
  const ages = [kills?.fetchedAt, jumps?.fetchedAt].filter((date): date is Date => !!date);
  return {
    kills: kills ? indexSystemKills(kills.data) : null,
    jumps: jumps ? indexSystemJumps(jumps.data) : null,
    fetchedAt: ages.length === 0 ? null : new Date(Math.min(...ages.map((d) => d.getTime()))),
  };
}

/**
 * Region names for a route. `regions.json` carries only regions that hold a
 * market, so ESI names the rest in one batched call; a region neither can
 * name is simply absent, and the row shows a dash.
 */
export async function loadRouteRegionNames(
  regionIds: readonly number[]
): Promise<ReadonlyMap<number, string>> {
  const catalog = await loadMarketRegions().catch(() => []);
  const local = new Map(catalog.map((entry) => [entry.id, entry.name]));
  const names = new Map<number, string>();
  const missing: number[] = [];
  for (const regionId of new Set(regionIds)) {
    const name = local.get(regionId);
    if (name === undefined) missing.push(regionId);
    else names.set(regionId, name);
  }
  if (missing.length > 0) {
    const resolved = await postUniverseNames(missing).catch(() => []);
    for (const entry of resolved) names.set(entry.id, entry.name);
  }
  return names;
}
