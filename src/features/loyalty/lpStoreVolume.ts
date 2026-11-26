import { useCallback } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { R2_SNAPSHOT_ORIGIN, fetchJson } from '@/features/contractSearch/r2OfferSnapshot';
import { HOUR_MS } from '@/lib/age';

const STALE_AFTER_MS = 12 * HOUR_MS;

export type LpStoreVolume = Readonly<Record<number, number>>;

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

export function useLpStoreVolume(regionId: number | null): {
  volume: LpStoreVolume | null;
  settled: boolean;
} {
  const load = useKeyedLoad(
    regionId === null ? null : String(regionId),
    useCallback(() => loadLpStoreVolume(regionId!), [regionId])
  );
  return {
    volume: load.status === 'ready' ? load.data : null,
    settled: load.status === 'ready' || load.status === 'failed',
  };
}
