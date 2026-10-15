/**
 * Contract item lines, fetched on demand when a contract's detail modal
 * opens (item_exchange/auction only — courier/loan contracts have none).
 * Same "read live from ESI on open" shape as Item Detail (GLOSSARY.md round
 * 6): baking every contract's items into the list fetch would pay for detail
 * nobody opens.
 */
import { getCharacterContractItems, type ContractItem } from '@/esi/endpoints';
import { EsiError } from '@/esi/errors';
import { conditionalFetch, loadWithCache, STALE_AFTER, type CachedResult } from '@/esi/cache';

function cacheKey(contractId: number): string {
  return `contract-items:${contractId}`;
}

/**
 * Loads one contract's items, reporting what the cache hides: whether this
 * load went to the network at all (a fresh row never does), and the HTTP status
 * of the failure when ESI answered with one (0 for no answer). Request delivery
 * uses it to count only real reads against its cap, and to give up on a
 * contract only for a definite per-contract answer.
 */
export interface ContractItemsOutcome {
  result: CachedResult<ContractItem[]> | null;
  /** ESI was asked (including a conditional revalidation), not served from a fresh row. */
  networkRead: boolean;
  /** The status of the error ESI answered with when `result` is null; 0 when it did not answer. */
  failureStatus?: number;
}

export async function loadContractItemsDetailed(
  characterId: number,
  contractId: number
): Promise<ContractItemsOutcome> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterContractItems(characterId, contractId, options)
  );
  let networkRead = false;
  let failureStatus: number | undefined;
  const observed = async () => {
    networkRead = true;
    try {
      return await fetchLive();
    } catch (err) {
      failureStatus = err instanceof EsiError ? err.status : 0;
      throw err;
    }
  };
  const result = await loadWithCache(characterId, cacheKey(contractId), observed, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  });
  return {
    result,
    networkRead,
    ...(result === null && networkRead ? { failureStatus: failureStatus ?? 0 } : {}),
  };
}

/** One contract's item lines, or null if unresolvable (offline + uncached). */
export function loadContractItems(
  characterId: number,
  contractId: number
): Promise<CachedResult<ContractItem[]> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterContractItems(characterId, contractId, options)
  );
  return loadWithCache(
    characterId,
    cacheKey(contractId),
    fetchLive,
    // A contract's item lines are fixed when it is issued; only its *status*
    // moves, and that lives on the contract row, not here.
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
}
