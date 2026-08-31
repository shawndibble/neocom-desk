/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';
import type { Capped } from '@/lib/cap';

const KEY = 'assets';

/**
 * Assets (up to MAX_ASSET_PAGES worth). ESI or cache, with the auth-failure
 * state exposed separately from a missing/offline result, and `truncated`
 * exposed alongside the data rather than folded into it.
 */
export function loadCharacterAssets(
  characterId: number
): Promise<StatusResult<Capped<CharacterAsset>>> {
  return loadWithCacheStatus(characterId, KEY, () => getCharacterAssets(characterId));
}
