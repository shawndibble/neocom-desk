/**
 * Which types have any active order in a region (issue #6200): the Market
 * Browser's tree marks a leaf with none as "No orders in {Region}".
 */
import { useCallback, useMemo } from 'react';
import { getMarketTypes } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER, loadPaginatedWithCache } from '@/esi/cache';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

/**
 * The region's listed type ids, read through the shared cache for ESI's own
 * 10-minute window, so switching back to a region inside it costs no request.
 *
 * Null when the list is unavailable or missing pages: a short list would
 * claim live types have no orders, and absence of data is never "no orders".
 */
export async function loadRegionMarketTypes(regionId: number): Promise<ReadonlySet<number> | null> {
  const cached = await loadPaginatedWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `market-types:${regionId}`,
    () => getMarketTypes(regionId),
    { staleAfterMs: STALE_AFTER.default }
  );
  if (!cached || cached.truncated) return null;
  return new Set(cached.data);
}

/**
 * The listed types of `regionId`, never another region's. Null while it
 * loads, when it failed, and when `regionId` is null (no single region).
 */
export function useRegionMarketTypes(regionId: number | null): ReadonlySet<number> | null {
  const load = useKeyedLoad(
    regionId === null ? null : String(regionId),
    useCallback(() => loadRegionMarketTypes(regionId!), [regionId])
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
