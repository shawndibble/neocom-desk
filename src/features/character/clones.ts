/** Fetch + cache layer for the Clones view. */
import { getCharacterClones, type CharacterClones } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'clones';

/**
 * Jump clones, home location and last-jump timestamp. ESI or cache, with the
 * auth-failure state exposed so the view can offer a re-login instead of a
 * silent empty state when the clones scope was revoked.
 */
export function loadCharacterClones(characterId: number): Promise<StatusResult<CharacterClones>> {
  return loadWithCacheStatus(
    characterId,
    KEY,
    async () => (await getCharacterClones(characterId)).data
  );
}
