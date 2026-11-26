import { conditionalPagedFetch } from '@/esi/cache';
import { getCorporationContracts, type Contract } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { withAcceptedCourierInProgress } from '@/engine/contracts/contractStatus';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'contracts';

export type CorpContractsLoadResult = StatusResult<Contract[]>;

export async function loadCorporationContracts(
  characterId: number,
  corporationId: number
): Promise<CorpContractsLoadResult> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationContracts(characterId, corporationId, options)
  );
  const result = await loadCorpPaginatedWithCacheStatus(
    characterId,
    corporationId,
    KEY,
    fetchLive,
    {
      conditional,
    }
  );
  if (result.cached === null) return result;
  return {
    ...result,
    cached: { ...result.cached, data: result.cached.data.map(withAcceptedCourierInProgress) },
  };
}
