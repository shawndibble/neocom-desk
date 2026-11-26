import {
  conditionalFetch,
  GLOBAL_CACHE_CHARACTER_ID,
  loadWithCache,
  type CachedResult,
} from '@/esi/cache';
import { getUniverseSystemJumps, getUniverseSystemKills } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
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
  kills: ReadonlyMap<number, SystemKills> | null;
  jumps: ReadonlyMap<number, number> | null;
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

export async function loadPodKills(): Promise<ReadonlyMap<number, number> | null> {
  const kills = await loadFeed<SystemKillsEntry[]>(KILLS_CACHE_KEY, (options) =>
    getUniverseSystemKills(options)
  );
  return kills ? new Map(kills.data.map((entry) => [entry.system_id, entry.pod_kills])) : null;
}

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
    const resolved = await resolveNames(missing).catch(() => new Map<number, string>());
    for (const [id, name] of resolved) names.set(id, name);
  }
  return names;
}
