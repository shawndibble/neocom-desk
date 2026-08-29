/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadWithCache, type CachedResult } from './cache';

const KEY = 'assets';

/** All assets (every page). ESI or cache. */
export function loadCharacterAssets(
  characterId: number
): Promise<CachedResult<CharacterAsset[]> | null> {
  return loadWithCache(characterId, KEY, () => getCharacterAssets(characterId));
}
