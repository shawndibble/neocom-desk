/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadPaginatedWithCacheStatus, type StatusResult } from '@/esi/cache';
import { db } from '@/db';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

const KEY = 'assets';

/**
 * Assets (up to MAX_ASSET_PAGES worth). ESI or cache, with the auth-failure
 * state exposed separately from a missing/offline result. `truncated` on the
 * cached result means pages were capped or missing.
 */
export function loadCharacterAssets(characterId: number): Promise<StatusResult<CharacterAsset[]>> {
  return loadPaginatedWithCacheStatus(characterId, KEY, () => getCharacterAssets(characterId));
}

export interface OtherCharacterAssets {
  characterId: number;
  name: string;
  assets: CharacterAsset[];
}

/**
 * Every OTHER authenticated Character's assets, for the Assets page's
 * cross-character search toggle (issue #85) — cache-or-live per
 * `loadCharacterAssets`, fanned out with capped concurrency like
 * `roster.ts`'s live mode. A Character that never granted the assets scope,
 * or whose live call fails with nothing cached, is silently skipped: the
 * toggle degrades per Character rather than failing as a whole.
 */
export async function loadOtherCharactersAssets(
  activeCharacterId: number
): Promise<OtherCharacterAssets[]> {
  const characters = await db.characters.toArray();
  const others = characters.filter((c) => c.characterId !== activeCharacterId);
  const results: OtherCharacterAssets[] = [];
  await mapWithConcurrencyLimit(others, ESI_FANOUT_CONCURRENCY, async (character) => {
    const { cached } = await loadCharacterAssets(character.characterId);
    if (cached) {
      results.push({
        characterId: character.characterId,
        name: character.name,
        assets: cached.data,
      });
    }
  });
  return results;
}
