/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';
import type { Capped } from '@/lib/cap';

const KEY = 'assets';

/**
 * Assets (up to MAX_ASSET_PAGES worth). ESI or cache, with the auth-failure
 * state exposed so the view can offer a re-login instead of a silent empty
 * state when the assets scope was revoked (issue #14), and `truncated`
 * exposed so the view can say so rather than presenting a cut list as
 * complete (issue #16).
 */
export function loadCharacterAssets(
  characterId: number
): Promise<StatusResult<Capped<CharacterAsset>>> {
  return loadWithCacheStatus(characterId, KEY, () => getCharacterAssets(characterId));
}
