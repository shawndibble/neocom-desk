/** Fetch + cache layer for the Contracts view. */
import { getCharacterContracts, type Contract } from '@/esi/endpoints';
import { withAcceptedCourierInProgress } from '@/engine/contracts/contractStatus';
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
  // Mapped after the cache read, not before the write: a 304 keeps the stored rows as they were.
  return loadPaginatedWithCacheStatus(characterId, KEY, fetchLive, { conditional }).then(
    (result) => ({
      ...result,
      cached: result.cached && {
        ...result.cached,
        data: result.cached.data.map(withAcceptedCourierInProgress),
      },
    })
  );
}

// Re-exported rather than defined here: the predicate is pure and now lives
// in `engine/contractStatus.ts`, so `calendarBoardSources.ts` can read it
// without pulling this module's Dexie-backed loaders in with it. Existing
// callers keep importing it from here.
export { isActiveContractStatus } from '@/engine/contracts/contractStatus';
