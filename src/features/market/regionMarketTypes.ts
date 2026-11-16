/**
 * Which types have any active order in a region (issue #6200): the Market
 * Browser's tree marks a leaf with none as "No orders in {Region}".
 */
import { useCallback, useMemo, useState } from 'react';
import { getMarketTypes } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER, loadPaginatedWithCache } from '@/esi/cache';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useTicker } from '@/lib/ticker';
import { MINUTE_MS } from '@/lib/age';

/**
 * The region's listed type ids, read through the shared cache for ESI's own
 * 10-minute window, so switching back to a region inside it costs no request.
 *
 * Null when the list is unavailable, missing pages, or a saved copy older
 * than that window (the refresh failed): a short or old list would claim
 * live types have no orders, and absence of data is never "no orders".
 */
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

/** While the last load came back empty (failed, truncated), retry this often. */
const RETRY_EMPTY_MS = MINUTE_MS;

/**
 * Which reload a moment belongs to: a new slot reloads the list. Once per
 * cache window while a list is held, every `RETRY_EMPTY_MS` while the last
 * load came back empty.
 */
export function regionTypesReloadSlot(nowMs: number, lastEmpty: boolean): number {
  return Math.floor(nowMs / (lastEmpty ? RETRY_EMPTY_MS : STALE_AFTER.default));
}

/**
 * The listed types of `regionId`, never another region's. Null while it
 * loads, when it failed, and when `regionId` is null (no single region).
 *
 * Reloaded after each cache window (inside it the cache answers with no
 * request), at once when the tab returns to view past one (the shared ticker
 * ticks on becoming visible), and every minute after an empty load.
 */
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
      // `slot` is the reload trigger: a new one is a new loader, refreshed behind the last list.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regionId, slot])
  );
  return load.status === 'ready' ? load.data : null;
}

/** What the tree needs to mark a leaf: whose region, and whether a type trades there. */
export interface NoOrdersCue {
  regionName: string;
  hasOrders: (typeId: number) => boolean;
}

/**
 * The tree's "No orders in {Region}" cue for one region, or null for no cue:
 * no single region, no name for it, overrides or the list still loading, or
 * the list failed. A Global Market Region type (PLEX) trades in its own
 * region whatever the browser's scope, so it is never marked.
 */
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
