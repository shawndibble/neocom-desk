/**
 * Fetch + cache layer for the corporation's contracts (issue #4607).
 *
 * Corp-keyed and corp-auth-aware through `corpRead.ts`, like the other corp
 * reads. ESI names no in-game role for it, so a 403 here is a missing or lapsed
 * scope; the capability's scope is additive (`corpScopes.ts`), and callers gate
 * on `canReadContracts` before reading. Items and bids are not read here: they
 * are fetched only when a row is opened.
 */
import { conditionalPagedFetch } from '@/esi/cache';
import { getCorporationContracts, type Contract } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { withAcceptedCourierInProgress } from '@/engine/contracts/contractStatus';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'contracts';

export type CorpContractsLoadResult = StatusResult<Contract[]>;

/**
 * Contracts issued by or assigned to the corporation. ESI or cache. The one read
 * path for the widget and the Contracts page: an accepted courier stays
 * `outstanding` in ESI, so it is read as `in_progress` here, once.
 */
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
