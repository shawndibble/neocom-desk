/** Fetch + cache layer for the Contracts view. */
import { getCharacterContracts, type Contract } from '@/esi/endpoints';
import { loadWithCache, type CachedResult } from './cache';

const KEY = 'contracts';

/** All contracts (every page). ESI or cache. */
export function loadContracts(characterId: number): Promise<CachedResult<Contract[]> | null> {
  return loadWithCache(characterId, KEY, () => getCharacterContracts(characterId));
}
