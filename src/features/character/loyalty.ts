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

/**
 * Paragon, the NPC corp behind EverMarks — in-client they read as a distinct
 * currency, but ESI carries them as an ordinary entry in this same loyalty
 * points array. Confirmed live: GET /corporations/1000419/ returns Paragon.
 */
export const PARAGON_CORPORATION_ID = 1000419;

/** Pulls the Paragon (EverMarks) entry out of a loyalty points list, for the Wallet balance box. */
export function splitEverMarks(entries: readonly CharacterLoyaltyPoints[]): {
  everMarks: number;
  otherLoyalty: CharacterLoyaltyPoints[];
} {
  const paragon = entries.find((entry) => entry.corporation_id === PARAGON_CORPORATION_ID);
  const otherLoyalty = entries.filter((entry) => entry.corporation_id !== PARAGON_CORPORATION_ID);
  return { everMarks: paragon?.loyalty_points ?? 0, otherLoyalty };
}
