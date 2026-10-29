/**
 * Player kills over the last 24 hours for a saved route's systems, for the
 * Overview's Route safety widget.
 *
 * Read the way Route Safety's own column is (one zKillboard request per region,
 * low concurrency, decision `20261005-125019`), only over a day instead of an
 * hour, and cached per region for ten minutes so two widgets and a refresh
 * share one answer. A region zKillboard could not answer in full (a failure, a
 * 429, a page cap) leaves its systems unknown, never zero.
 */
import { fetchRegionRecentKills, type RegionRecentKillsResult } from '@/lib/zkillboard';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { MINUTE_MS } from '@/lib/age';

export const ROUTE_KILLS_WINDOW_SECONDS = 24 * 3600;
export const ROUTE_KILLS_TTL_MS = 10 * MINUTE_MS;

/** Low on purpose: zKillboard is a third party that rate-limits hard. */
const CONCURRENCY = 3;

const regionCache = new Map<number, { at: number; result: Promise<RegionRecentKillsResult> }>();

async function loadRegionDay(regionId: number, now: number): Promise<RegionRecentKillsResult> {
  const cached = regionCache.get(regionId);
  if (cached && now - cached.at < ROUTE_KILLS_TTL_MS) return cached.result;
  const entry = { at: now, result: fetchRegionRecentKills(regionId, ROUTE_KILLS_WINDOW_SECONDS) };
  regionCache.set(regionId, entry);
  const result = await entry.result;
  // A failure is forgotten, so the next look asks again.
  if (!result.ok && regionCache.get(regionId) === entry) regionCache.delete(regionId);
  return result;
}

/** Kill times (epoch ms) per system; `null` for a system that could not be read. Never rejects. */
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

/** For tests. */
export function clearRouteKills24hCache(): void {
  regionCache.clear();
}
