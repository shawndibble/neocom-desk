/**
 * Contract item lines, fetched on demand when a contract's detail modal
 * opens (item_exchange/auction only — courier/loan contracts have none).
 * Same "read live from ESI on open" shape as Item Detail (CONTEXT.md round
 * 6): baking every contract's items into the list fetch would pay for detail
 * nobody opens.
 */
import { getCharacterContractItems, type ContractItem } from '@/esi/endpoints';
import { loadWithCache, STALE_AFTER, type CachedResult } from '@/esi/cache';

function cacheKey(contractId: number): string {
  return `contract-items:${contractId}`;
}

/** One contract's item lines, or null if unresolvable (offline + uncached). */
export function loadContractItems(
  characterId: number,
  contractId: number
): Promise<CachedResult<ContractItem[]> | null> {
  return loadWithCache(
    characterId,
    cacheKey(contractId),
    async () => (await getCharacterContractItems(characterId, contractId)).data,
    // A contract's item lines are fixed when it is issued; only its *status*
    // moves, and that lives on the contract row, not here.
    { staleAfterMs: STALE_AFTER.static }
  );
}
