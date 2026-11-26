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
    { staleAfterMs: STALE_AFTER.static, conditional, reportFetchFailure: true }
  );
  return { result: cached, failed: fetchFailed === true };
}

export async function loadLoyaltyStoreOffers(
  corporationId: number
): Promise<CachedResult<LoyaltyStoreOffer[]> | null> {
  return (await loadLoyaltyStoreOffersStatus(corporationId)).result;
}

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
