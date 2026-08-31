/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadPaginatedWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'assets';

/**
 * Assets (up to MAX_ASSET_PAGES worth). ESI or cache, with the auth-failure
 * state exposed separately from a missing/offline result. `truncated` on the
 * cached result means pages were capped or missing.
 */
export function loadCharacterAssets(characterId: number): Promise<StatusResult<CharacterAsset[]>> {
  return loadPaginatedWithCacheStatus(characterId, KEY, () => getCharacterAssets(characterId));
}
