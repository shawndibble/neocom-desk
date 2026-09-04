/** Fetch + cache layer for the Contracts view. */
import { getCharacterContracts, type Contract } from '@/esi/endpoints';
import { loadPaginatedWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'contracts';

/**
 * All contracts (every page). ESI or cache, with the auth-failure state
 * exposed so the view can offer a re-login instead of a silent empty state
 * when the contracts scope was revoked (issue #14). `truncated` on the cached
 * result means pages were missing.
 */
export function loadContracts(characterId: number): Promise<StatusResult<Contract[]>> {
  return loadPaginatedWithCacheStatus(characterId, KEY, () => getCharacterContracts(characterId));
}

/** A contract still open or being worked, as opposed to the character's full (mostly historical) contract history. */
const ACTIVE_STATUSES = new Set<Contract['status']>(['outstanding', 'in_progress']);

export function isActiveContractStatus(status: Contract['status']): boolean {
  return ACTIVE_STATUSES.has(status);
}
