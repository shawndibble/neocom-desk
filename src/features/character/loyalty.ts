/** Fetch + cache layer for the Loyalty Points view. */
import { getCharacterLoyaltyPoints, type CharacterLoyaltyPoints } from '@/esi/endpoints';
import {
  conditionalFetch,
  loadWithCacheStatus,
  readCached,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';

export const KEY = 'loyalty';

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

/**
 * Several Characters' loyalty points as one list: each corporation's points
 * summed across every list, in first-seen order. ESI has no corporation LP
 * endpoint, so this per-Character sum is the only "all Characters" figure.
 */
export function sumLoyaltyByCorporation(
  lists: readonly (readonly CharacterLoyaltyPoints[])[]
): CharacterLoyaltyPoints[] {
  const totals = new Map<number, number>();
  for (const list of lists) {
    for (const entry of list) {
      totals.set(
        entry.corporation_id,
        (totals.get(entry.corporation_id) ?? 0) + entry.loyalty_points
      );
    }
  }
  return [...totals].map(([corporation_id, loyalty_points]) => ({
    corporation_id,
    loyalty_points,
  }));
}

/**
 * The Wallet's loyalty points for several Characters at once (issue #4694):
 * every readable Character's list summed per corporation, and the Characters
 * whose grant lacks the loyalty scope named apart so they never drop out of
 * the sum silently. A list kept from before a revoked grant is left out with
 * them. The sum is as fresh as its stalest list; `null` when no Character
 * could be read at all.
 */
export function combineLoyaltyStatuses(
  entries: readonly { characterId: number; status: StatusResult<CharacterLoyaltyPoints[]> }[]
): { result: CachedResult<CharacterLoyaltyPoints[]> | null; reauthCharacterIds: number[] } {
  const reauthCharacterIds = entries
    .filter((entry) => entry.status.needsReauth)
    .map((entry) => entry.characterId);
  const readable = entries.flatMap((entry) =>
    entry.status.needsReauth || !entry.status.cached ? [] : [entry.status.cached]
  );
  if (readable.length === 0) return { result: null, reauthCharacterIds };
  return {
    result: {
      data: sumLoyaltyByCorporation(readable.map((cached) => cached.data)),
      fetchedAt: new Date(Math.min(...readable.map((cached) => cached.fetchedAt.getTime()))),
      fromCache: readable.some((cached) => cached.fromCache),
      truncated: readable.some((cached) => cached.truncated),
    },
    reauthCharacterIds,
  };
}
