/** Fetch + cache layer for the Contracts view. */
import { getCharacterContracts, type Contract } from '@/esi/endpoints';
import { loadPaginatedWithCache, type CachedResult } from '@/esi/cache';

const KEY = 'contracts';

/** All contracts. `truncated` on the result means pages were missing. */
export function loadContracts(characterId: number): Promise<CachedResult<Contract[]> | null> {
  return loadPaginatedWithCache(characterId, KEY, () => getCharacterContracts(characterId));
}
