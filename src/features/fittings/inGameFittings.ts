/**
 * Fetch + cache layer for In-game Fittings (issue #1539): the active
 * Character's ESI-saved fittings, read through the ordinary ESI cache like
 * any other list. Never written to the Fittings domain's own storage (My
 * Fittings, #1538) — that only happens on an explicit save.
 */
import { getCharacterFittings, type CharacterFitting } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'fittings:inGame';

export function loadInGameFittings(characterId: number): Promise<StatusResult<CharacterFitting[]>> {
  return loadWithCacheStatus(
    characterId,
    KEY,
    async () => (await getCharacterFittings(characterId)).data
  );
}
