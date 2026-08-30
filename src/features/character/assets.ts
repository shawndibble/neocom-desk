/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadPaginatedWithCache, type CachedResult } from '@/esi/cache';

const KEY = 'assets';

/** All assets. `truncated` on the result means pages were missing. */
export function loadCharacterAssets(
  characterId: number
): Promise<CachedResult<CharacterAsset[]> | null> {
  return loadPaginatedWithCache(characterId, KEY, () => getCharacterAssets(characterId));
}
