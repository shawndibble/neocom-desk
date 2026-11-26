import { getCharacterLoyaltyPoints, type CharacterLoyaltyPoints } from '@/esi/endpoints';
import {
  conditionalFetch,
  loadWithCacheStatus,
  readCached,
  type CachedResult,
  type StatusResult,
} from '@/esi/cache';

export const KEY = 'loyalty';

export function loadCharacterLoyaltyPoints(
  characterId: number
): Promise<StatusResult<CharacterLoyaltyPoints[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterLoyaltyPoints(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

export async function readCachedLoyaltyBalances(characterId: number): Promise<Map<number, number>> {
  const cached = await readCached<CharacterLoyaltyPoints[]>(characterId, KEY);
  return new Map((cached ?? []).map((entry) => [entry.corporation_id, entry.loyalty_points]));
}

export const PARAGON_CORPORATION_ID = 1000419;

export function splitEverMarks(entries: readonly CharacterLoyaltyPoints[]): {
  everMarks: number;
  otherLoyalty: CharacterLoyaltyPoints[];
} {
  const paragon = entries.find((entry) => entry.corporation_id === PARAGON_CORPORATION_ID);
  const otherLoyalty = entries.filter((entry) => entry.corporation_id !== PARAGON_CORPORATION_ID);
  return { everMarks: paragon?.loyalty_points ?? 0, otherLoyalty };
}

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
