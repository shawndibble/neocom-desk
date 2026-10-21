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
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'contracts';

export type CorpContractsLoadResult = StatusResult<Contract[]>;

/** Contracts issued by or assigned to the corporation. ESI or cache. */
export function loadCorporationContracts(
  characterId: number,
  corporationId: number
): Promise<CorpContractsLoadResult> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationContracts(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEY, fetchLive, {
    conditional,
  });
}
