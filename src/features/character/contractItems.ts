/**
 * Contract item lines, fetched on demand when a contract's detail modal
 * opens (item_exchange/auction only — courier/loan contracts have none).
 * Same "read live from ESI on open" shape as Item Detail (GLOSSARY.md round
 * 6): baking every contract's items into the list fetch would pay for detail
 * nobody opens.
 */
import {
  getCharacterContractItems,
  getCorporationContractItems,
  type ContractItem,
} from '@/esi/endpoints';
import { EsiError } from '@/esi/errors';
import { archiveContractItems } from './contractArchive';
import {
  conditionalFetch,
  corpCacheKey,
  loadWithCache,
  STALE_AFTER,
  type CachedResult,
} from '@/esi/cache';

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
  contractId: number,
  /** A corporation's contract: read through the corp route, filed under the corporation. */
  corporationId?: number
): Promise<ContractItemsOutcome> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    corporationId === undefined
      ? getCharacterContractItems(characterId, contractId, options)
      : getCorporationContractItems(characterId, corporationId, contractId, options)
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
  const key =
    corporationId === undefined
      ? cacheKey(contractId)
      : corpCacheKey(corporationId, cacheKey(contractId));
  const result = await loadWithCache(characterId, key, observed, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  });
  // The Character's own contracts only; ESI forgets a finished contract's items after 30 days.
  if (result && corporationId === undefined) {
    await archiveContractItems(characterId, contractId, result.data);
  }
  return {
    result,
    networkRead,
    ...(result === null && networkRead ? { failureStatus: failureStatus ?? 0 } : {}),
  };
}
