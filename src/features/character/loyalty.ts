/** Fetch + cache layer for the Loyalty Points view. */
import { getCharacterLoyaltyPoints, type CharacterLoyaltyPoints } from '@/esi/endpoints';
import { conditionalFetch, loadWithCacheStatus, readCached, type StatusResult } from '@/esi/cache';

const KEY = 'loyalty';

/**
 * Loyalty point balances per corporation. ESI or cache, with the
 * auth-failure state exposed so the view can offer a re-login instead of a
 * silent empty state when the loyalty scope was revoked.
 */
export function loadCharacterLoyaltyPoints(
  characterId: number
): Promise<StatusResult<CharacterLoyaltyPoints[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterLoyaltyPoints(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

/**
 * The Character's LP per corporation from whatever is already cached — no ESI
 * call, so a hint (the Command Palette's LP Stores group) can read it freely.
 * Empty until the Wallet's Loyalty Points view has loaded once.
 */
export async function readCachedLoyaltyBalances(characterId: number): Promise<Map<number, number>> {
  const cached = await readCached<CharacterLoyaltyPoints[]>(characterId, KEY);
  return new Map((cached ?? []).map((entry) => [entry.corporation_id, entry.loyalty_points]));
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
