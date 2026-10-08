/**
 * LP store data: GET /loyalty/stores/{corporation_id}/offers/ is public (no
 * character scope) and cacheable like a station or universe type — see
 * src/features/character/stations.ts for the same shape. The corp name is
 * fetched alongside it for the page header.
 */
import {
  getLoyaltyStoreOffers,
  getCorporationPublicInfo,
  type LoyaltyStoreOffer,
} from '@/esi/endpoints';
import {
  conditionalFetch,
  loadWithCache,
  loadWithCacheStatus,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  type CachedResult,
} from '@/esi/cache';

function offersCacheKey(corporationId: number): string {
  return `loyalty-store-offers:${corporationId}`;
}

function corpNameCacheKey(corporationId: number): string {
  return `corp-name:${corporationId}`;
}

/**
 * A corp's current LP store offers. `result` is null when unresolvable;
 * `failed` says whether that is because ESI did not answer (and nothing was
 * cached), so a page can show an error rather than an empty store.
 */
export async function loadLoyaltyStoreOffersStatus(
  corporationId: number
): Promise<{ result: CachedResult<LoyaltyStoreOffer[]> | null; failed: boolean }> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getLoyaltyStoreOffers(corporationId, options)
  );
  const { cached, fetchFailed } = await loadWithCacheStatus(
    GLOBAL_CACHE_CHARACTER_ID,
    offersCacheKey(corporationId),
    fetchLive,
    // Offers change with balance passes / new content, not minute to minute —
    // same cadence as a station or universe type.
    { staleAfterMs: STALE_AFTER.static, conditional, reportFetchFailure: true }
  );
  return { result: cached, failed: fetchFailed === true };
}

/** A corp's current LP store offers, or null if unresolvable (offline + uncached). */
export async function loadLoyaltyStoreOffers(
  corporationId: number
): Promise<CachedResult<LoyaltyStoreOffer[]> | null> {
  return (await loadLoyaltyStoreOffersStatus(corporationId)).result;
}

/** A corporation's display name, or null if unresolvable (offline + uncached). */
export async function loadCorporationName(corporationId: number): Promise<string | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationPublicInfo(corporationId, options)
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    corpNameCacheKey(corporationId),
    fetchLive,
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
  return result?.data.name ?? null;
}
