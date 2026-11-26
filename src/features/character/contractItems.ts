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

export function contractItemsCacheKey(contractId: number): string {
  return `contract-items:${contractId}`;
}

export interface ContractItemsOutcome {
  result: CachedResult<ContractItem[]> | null;
  networkRead: boolean;
  failureStatus?: number;
}

export async function loadContractItemsDetailed(
  characterId: number,
  contractId: number,
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
      ? contractItemsCacheKey(contractId)
      : corpCacheKey(corporationId, contractItemsCacheKey(contractId));
  const result = await loadWithCache(characterId, key, observed, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  });
  if (result && corporationId === undefined) {
    await archiveContractItems(characterId, contractId, result.data);
  }
  return {
    result,
    networkRead,
    ...(result === null && networkRead ? { failureStatus: failureStatus ?? 0 } : {}),
  };
}
