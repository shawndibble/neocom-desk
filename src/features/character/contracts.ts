/** Fetch + cache layer for the Contracts view. */
import { getCharacterContracts, type Contract } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'contracts';

/**
 * All contracts (every page). ESI or cache, with the auth-failure state
 * exposed so the view can offer a re-login instead of a silent empty state
 * when the contracts scope was revoked (issue #14).
 */
export function loadContracts(characterId: number): Promise<StatusResult<Contract[]>> {
  return loadWithCacheStatus(characterId, KEY, () => getCharacterContracts(characterId));
}
