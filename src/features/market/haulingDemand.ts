/**
 * Reads a Trade Hub region's demand object (issue #5344), published daily by the
 * `public-data-lp-store` GitHub Actions job (`hauling-demand/<regionId>.json` in R2;
 * `functions/src/marketHistoryVolume.ts`): every type's 30-day demand folded from
 * EVE Ref's history files. One cached request per region replaces a history call
 * per item in the hauling scan's pass 2. `null` means unavailable or stale, and the
 * scan falls back to ESI history.
 */
import { useEffect, useState } from 'react';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { R2_SNAPSHOT_ORIGIN, fetchJson } from '@/features/contractSearch/r2OfferSnapshot';
import type { DemandAggregate } from '@/engine/market/haulingMarket';
import { HOUR_MS, DAY_MS } from '@/lib/age';

/** The backend republishes once a day. */
const STALE_AFTER_MS = 12 * HOUR_MS;
/** Newest day of data older than this means the daily job stopped (it is normally 1 to 2 days old): ESI is the better source. */
export const MAX_DEMAND_AGE_MS = 4 * DAY_MS;

export interface HaulingDemand {
  /** The newest day the 30-day window ends on (ISO date). */
  asOf: string;
  lastSyncedAt: number;
  /** By type id; a type that never traded in the window is absent. */
  types: ReadonlyMap<number, DemandAggregate>;
}

function parseDemand(tuple: unknown): DemandAggregate | null {
  if (!Array.isArray(tuple) || tuple.length < 7) return null;
  const [volume, daysWithTrades, orderSum, price, date, highest, lowest] = tuple as unknown[];
  if (
    typeof volume !== 'number' ||
    typeof daysWithTrades !== 'number' ||
    typeof orderSum !== 'number' ||
    (price !== null && typeof price !== 'number') ||
    typeof date !== 'string' ||
    typeof highest !== 'number' ||
    typeof lowest !== 'number'
  ) {
    return null;
  }
  return {
    volume,
    daysWithTrades,
    orderSum,
    recentSalePrice: price,
    latestDay: { date, highest, lowest },
  };
}

/** The object as `functions/src/r2DailySnapshots.ts` writes it, or `null` when it is not that shape. */
export function parseHaulingDemand(raw: unknown): HaulingDemand | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { lastSyncedAt, asOf, types } = raw as Record<string, unknown>;
  if (typeof lastSyncedAt !== 'number' || !(lastSyncedAt > 0)) return null;
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  if (typeof types !== 'object' || types === null || Array.isArray(types)) return null;
  const byType = new Map<number, DemandAggregate>();
  for (const [typeId, tuple] of Object.entries(types)) {
    const id = Number(typeId);
    const aggregate = parseDemand(tuple);
    if (Number.isInteger(id) && aggregate) byType.set(id, aggregate);
  }
  return { asOf, lastSyncedAt, types: byType };
}

async function fetchDemand(regionId: number): Promise<HaulingDemand | null> {
  try {
    return parseHaulingDemand(
      await fetchJson(`${R2_SNAPSHOT_ORIGIN}/hauling-demand/${regionId}.json`)
    );
  } catch {
    return null;
  }
}

export async function loadHaulingDemand(regionId: number): Promise<HaulingDemand | null> {
  try {
    const cached = await loadWithCache(
      GLOBAL_CACHE_CHARACTER_ID,
      `haulingDemandR2:${regionId}`,
      () => fetchDemand(regionId),
      { staleAfterMs: STALE_AFTER_MS, allowStaleServe: true }
    );
    const demand = cached?.data ?? null;
    return demand && Date.now() - Date.parse(`${demand.asOf}T00:00:00Z`) <= MAX_DEMAND_AGE_MS
      ? demand
      : null;
  } catch {
    return null;
  }
}

/**
 * A hub region's demand, tagged with its region so a hub change never reads
 * the previous hub's. `regionId` null loads nothing. `settled` once this
 * region's read is done; `demand` null for good when it is missing or stale.
 */
export function useHaulingDemand(regionId: number | null): {
  demand: HaulingDemand | null;
  settled: boolean;
} {
  const [loaded, setLoaded] = useState<{ regionId: number; demand: HaulingDemand | null } | null>(
    null
  );
  useEffect(() => {
    if (regionId === null) return;
    let cancelled = false;
    void loadHaulingDemand(regionId).then((demand) => {
      if (!cancelled) setLoaded({ regionId, demand });
    });
    return () => {
      cancelled = true;
    };
  }, [regionId]);
  const settled = loaded !== null && loaded.regionId === regionId;
  return { demand: settled ? loaded.demand : null, settled };
}
