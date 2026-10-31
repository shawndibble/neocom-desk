/**
 * Reads a Trade Hub region's units-per-day object (issue #5127), published daily
 * next to the LP offers snapshot by the `public-data-lp-store` GitHub Actions job
 * (`lp-store-volume/<regionId>.json` in R2; `functions/src/marketHistoryVolume.ts`).
 * One small object per hub region, read whole, so opening a store costs one
 * cached request, never a history call per row. `null` means unavailable.
 */
import { useEffect, useState } from 'react';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { R2_SNAPSHOT_ORIGIN, fetchJson } from '@/features/contractSearch/r2OfferSnapshot';
import { HOUR_MS } from '@/lib/age';

/** The backend republishes once a day. */
const STALE_AFTER_MS = 12 * HOUR_MS;

/** Units per day by type id; a type that never traded in the window is absent. */
export type LpStoreVolume = Readonly<Record<number, number>>;

/** The object as `functions/src/r2DailySnapshots.ts` writes it, or `null` when it is not that shape. */
export function parseLpStoreVolume(raw: unknown): LpStoreVolume | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { lastSyncedAt, perDay } = raw as Record<string, unknown>;
  if (typeof lastSyncedAt !== 'number' || !(lastSyncedAt > 0)) return null;
  if (typeof perDay !== 'object' || perDay === null || Array.isArray(perDay)) return null;
  const volume: Record<number, number> = {};
  for (const [typeId, value] of Object.entries(perDay)) {
    const id = Number(typeId);
    if (Number.isInteger(id) && typeof value === 'number' && value > 0) volume[id] = value;
  }
  return volume;
}

async function fetchVolume(regionId: number): Promise<LpStoreVolume | null> {
  try {
    return parseLpStoreVolume(
      await fetchJson(`${R2_SNAPSHOT_ORIGIN}/lp-store-volume/${regionId}.json`)
    );
  } catch {
    return null;
  }
}

export async function loadLpStoreVolume(regionId: number): Promise<LpStoreVolume | null> {
  try {
    const cached = await loadWithCache(
      GLOBAL_CACHE_CHARACTER_ID,
      `lpStoreVolumeR2:${regionId}`,
      () => fetchVolume(regionId),
      { staleAfterMs: STALE_AFTER_MS, allowStaleServe: true }
    );
    return cached?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * A hub region's volume, tagged with its region so a hub change never reads
 * the previous hub's. `regionId` null (the hub setting not hydrated yet)
 * loads nothing: the default hub's volume would be the wrong number.
 * `settled` once this region's read is done, `volume` null for good when it failed.
 */
export function useLpStoreVolume(regionId: number | null): {
  volume: LpStoreVolume | null;
  settled: boolean;
} {
  const [loaded, setLoaded] = useState<{ regionId: number; volume: LpStoreVolume | null } | null>(
    null
  );
  useEffect(() => {
    if (regionId === null) return;
    let cancelled = false;
    void loadLpStoreVolume(regionId).then((volume) => {
      if (!cancelled) setLoaded({ regionId, volume });
    });
    return () => {
      cancelled = true;
    };
  }, [regionId]);
  const settled = loaded !== null && loaded.regionId === regionId;
  return { volume: settled ? loaded.volume : null, settled };
}
