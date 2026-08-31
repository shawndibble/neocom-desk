/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'assets';

/**
 * All assets (every page). ESI or cache, with the auth-failure state exposed
 * so the view can offer a re-login instead of a silent empty state when the
 * assets scope was revoked (issue #14).
 */
export function loadCharacterAssets(
  characterId: number
): Promise<StatusResult<CharacterAsset[]>> {
  return loadWithCacheStatus(characterId, KEY, () => getCharacterAssets(characterId));
}
