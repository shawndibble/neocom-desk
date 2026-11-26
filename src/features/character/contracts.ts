import { getCharacterContracts, type Contract } from '@/esi/endpoints';
import { withAcceptedCourierInProgress } from '@/engine/contracts/contractStatus';
import {
  conditionalPagedFetch,
  loadPaginatedWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';
import { archiveContracts, contractsWithArchive } from './contractArchive';

export const KEY = 'contracts';

export function loadContracts(characterId: number): Promise<StatusResult<Contract[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterContracts(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEY, fetchLive, { conditional }).then(
    async (result) => {
      await archiveContracts(characterId, result.cached);
      return {
        ...result,
        cached: result.cached && {
          ...result.cached,
          data: result.cached.data.map(withAcceptedCourierInProgress),
        },
      };
    }
  );
}

export async function loadContractsWithArchive(
  characterId: number
): Promise<StatusResult<Contract[]>> {
  const result = await loadContracts(characterId);
  return { ...result, cached: await contractsWithArchive(characterId, result.cached) };
}

export { isActiveContractStatus } from '@/engine/contracts/contractStatus';
