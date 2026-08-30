/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadWithCache, type CachedResult } from '@/esi/cache';

const KEY = 'assets';

/** All assets (every page). ESI or cache. */
export function loadCharacterAssets(
  characterId: number
): Promise<CachedResult<CharacterAsset[]> | null> {
  return loadWithCache(characterId, KEY, async () => (await getCharacterAssets(characterId)).items);
}

/**
 * Assets, plus whether pages were missing from the fetch (D4). `truncated`
 * describes the fetch this call made, so it is only ever true for a fresh
 * response — a cache hit has no page count to compare against.
 */
export async function loadCharacterAssetsWithTruncation(characterId: number): Promise<{
  cached: CachedResult<CharacterAsset[]> | null;
  truncated: boolean;
}> {
  let truncated = false;
  const cached = await loadWithCache(characterId, KEY, async () => {
    const result = await getCharacterAssets(characterId);
    truncated = result.truncated;
    return result.items;
  });
  return { cached, truncated };
}
