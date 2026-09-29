/** Fetch + cache layer for the Contracts view. */
import { getCharacterContracts, type Contract } from '@/esi/endpoints';
import {
  conditionalPagedFetch,
  loadPaginatedWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';

export const KEY = 'contracts';

/**
 * All contracts (every page). ESI or cache, with the auth-failure state
 * exposed so the view can offer a re-login instead of a silent empty state
 * when the contracts scope was revoked (issue #14). `truncated` on the cached
 * result means pages were missing.
 */
export function loadContracts(characterId: number): Promise<StatusResult<Contract[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterContracts(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

// Re-exported rather than defined here: the predicate is pure and now lives
// in `engine/contractStatus.ts`, so `calendarBoardSources.ts` can read it
// without pulling this module's Dexie-backed loaders in with it. Existing
// callers keep importing it from here.
export { isActiveContractStatus } from '@/engine/contractStatus';
