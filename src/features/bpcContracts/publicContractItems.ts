import { EsiError } from '@/esi/client';
import { getPublicContractItems, type PublicContractItem } from '@/esi/endpoints';
import {
  loadWithCache,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
  type CachedResult,
} from '@/esi/cache';

function cacheKey(contractId: number): string {
  return `public-contract-items:${contractId}`;
}

export type PublicContractItemsOutcome =
  { kind: 'items'; items: PublicContractItem[] } | { kind: 'not-found' };

export function loadPublicContractItems(
  contractId: number
): Promise<CachedResult<PublicContractItemsOutcome> | null> {
  return loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(contractId),
    async () => {
      try {
        const { data } = await getPublicContractItems(contractId);
        return data === null ? null : { kind: 'items' as const, items: data };
      } catch (err) {
        if (err instanceof EsiError && err.status === 404) return { kind: 'not-found' as const };
        throw err;
      }
    },
    { staleAfterMs: STALE_AFTER.static }
  );
}
