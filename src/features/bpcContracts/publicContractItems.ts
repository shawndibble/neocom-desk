/**
 * Item lines on one public contract, fetched when its detail modal opens —
 * the same "read live on open" shape the character Contracts page uses
 * (`features/character/contractItems.ts`), against the public route instead.
 *
 * Cached under `GLOBAL_CACHE_CHARACTER_ID`, not the viewing character: a
 * public contract belongs to no character here, and twenty alts opening the
 * same contract should read one cached row rather than twenty.
 */
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

/** One public contract's item lines, or null if unresolvable (offline + uncached). */
export function loadPublicContractItems(
  contractId: number
): Promise<CachedResult<PublicContractItem[]> | null> {
  return loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(contractId),
    async () => (await getPublicContractItems(contractId)).data,
    // A contract's item lines are fixed when it is issued. What moves is
    // whether the contract still stands at all, and that is the snapshot's
    // job, not this one's.
    { staleAfterMs: STALE_AFTER.static }
  );
}
