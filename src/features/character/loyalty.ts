/** Fetch + cache layer for the Loyalty Points view. */
import { getCharacterLoyaltyPoints, type CharacterLoyaltyPoints } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'loyalty';

/**
 * Loyalty point balances per corporation. ESI or cache, with the
 * auth-failure state exposed so the view can offer a re-login instead of a
 * silent empty state when the loyalty scope was revoked.
 */
export function loadCharacterLoyaltyPoints(
  characterId: number
): Promise<StatusResult<CharacterLoyaltyPoints[]>> {
  return loadWithCacheStatus(
    characterId,
    KEY,
    async () => (await getCharacterLoyaltyPoints(characterId)).data
  );
}
