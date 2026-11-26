import { useCallback, useMemo, useState } from 'react';
import { getMarketTypes } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER, loadPaginatedWithCache } from '@/esi/cache';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useTicker } from '@/lib/ticker';
import { MINUTE_MS } from '@/lib/age';

export async function loadRegionMarketTypes(regionId: number): Promise<ReadonlySet<number> | null> {
  const cached = await loadPaginatedWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `market-types:${regionId}`,
    () => getMarketTypes(regionId),
    { staleAfterMs: STALE_AFTER.default }
  );
  if (!cached || cached.truncated) return null;
  if (Date.now() - cached.fetchedAt.getTime() > STALE_AFTER.default) return null;
  return new Set(cached.data);
}

const RETRY_EMPTY_MS = MINUTE_MS;

export function regionTypesReloadSlot(nowMs: number, lastEmpty: boolean): number {
  return Math.floor(nowMs / (lastEmpty ? RETRY_EMPTY_MS : STALE_AFTER.default));
}

export function useRegionMarketTypes(regionId: number | null): ReadonlySet<number> | null {
  const key = regionId === null ? null : String(regionId);
  const [emptyKey, setEmptyKey] = useState<string | null>(null);
  const now = useTicker(RETRY_EMPTY_MS);
  const slot = regionTypesReloadSlot(now, emptyKey !== null && emptyKey === key);
  const load = useKeyedLoad(
    key,
    useCallback(async () => {
      const types = await loadRegionMarketTypes(regionId!);
      setEmptyKey(types ? null : String(regionId));
      return types;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regionId, slot])
  );
  return load.status === 'ready' ? load.data : null;
}

export interface NoOrdersCue {
  regionName: string;
  hasOrders: (typeId: number) => boolean;
}

export function useNoOrdersCue(
  regionId: number | null,
  regionName: string | null,
  globalMarkets: ReadonlyMap<number, unknown> | null
): NoOrdersCue | null {
  const listed = useRegionMarketTypes(regionName === null ? null : regionId);
  return useMemo(
    () =>
      listed && regionName !== null && globalMarkets
        ? {
            regionName,
            hasOrders: (typeId: number) => listed.has(typeId) || globalMarkets.has(typeId),
          }
        : null,
    [listed, regionName, globalMarkets]
  );
}
