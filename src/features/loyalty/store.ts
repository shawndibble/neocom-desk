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
  loadWithCache,
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

/** A corp's current LP store offers, or null if unresolvable (offline + uncached). */
export async function loadLoyaltyStoreOffers(
  corporationId: number
): Promise<CachedResult<LoyaltyStoreOffer[]> | null> {
  return loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    offersCacheKey(corporationId),
    async () => (await getLoyaltyStoreOffers(corporationId)).data,
    // Offers change with balance passes / new content, not minute to minute —
    // same cadence as a station or universe type.
    { staleAfterMs: STALE_AFTER.static }
  );
}

/** A corporation's display name, or null if unresolvable (offline + uncached). */
export async function loadCorporationName(corporationId: number): Promise<string | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    corpNameCacheKey(corporationId),
    async () => (await getCorporationPublicInfo(corporationId)).data,
    { staleAfterMs: STALE_AFTER.static }
  );
  return result?.data.name ?? null;
}
