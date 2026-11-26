import { fetchRegionRecentKills, type RegionRecentKillsResult } from '@/lib/zkillboard';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { MINUTE_MS } from '@/lib/age';

export const ROUTE_KILLS_WINDOW_SECONDS = 24 * 3600;
export const ROUTE_KILLS_TTL_MS = 10 * MINUTE_MS;

const CONCURRENCY = 3;

const regionCache = new Map<number, { at: number; result: Promise<RegionRecentKillsResult> }>();

async function loadRegionDay(regionId: number, now: number): Promise<RegionRecentKillsResult> {
  const cached = regionCache.get(regionId);
  if (cached && now - cached.at < ROUTE_KILLS_TTL_MS) return cached.result;
  const entry = { at: now, result: fetchRegionRecentKills(regionId, ROUTE_KILLS_WINDOW_SECONDS) };
  regionCache.set(regionId, entry);
  const result = await entry.result;
  if (!result.ok && regionCache.get(regionId) === entry) regionCache.delete(regionId);
  return result;
}

export async function loadRouteKills24h(
  systemIds: readonly number[],
  now: number = Date.now()
): Promise<Map<number, number[] | null>> {
  const out = new Map<number, number[] | null>();
  const systems = await loadSolarSystemsById().catch(() => null);
  const byRegion = new Map<number, number[]>();
  for (const systemId of new Set(systemIds)) {
    const regionId = systems?.get(systemId)?.regionId;
    if (regionId === undefined) out.set(systemId, null);
    else byRegion.set(regionId, [...(byRegion.get(regionId) ?? []), systemId]);
  }
  await mapWithConcurrencyLimit([...byRegion], CONCURRENCY, async ([regionId, ids]) => {
    const result = await loadRegionDay(regionId, now);
    for (const id of ids) {
      out.set(id, result.ok ? (result.bySystem.get(id) ?? []).map((kill) => kill.time) : null);
    }
  });
  return out;
}

export function clearRouteKills24hCache(): void {
  regionCache.clear();
}
