/**
 * Fetch + cache layer for a character's NPC standings (issue #1238), used to
 * resolve the broker-fee reduction at NPC stations.
 *
 * `esi-characters.read_standings.v1` was added to the base grant after some
 * characters already logged in, so a token can lack it. Unlike
 * `industry/jobs.ts`'s `read_character_jobs` precedent, a missing standings
 * scope must NOT raise the app-wide reconnect banner — falling back to
 * "assume 0 standing" is exactly today's behaviour, not a broken feature, so
 * `detectAuthFailure` always returns false here: the 403 this endpoint
 * throws when the scope is absent gets treated as an ordinary "nothing
 * cached, fall back to []" case, same as being offline with no cache.
 */
import { getCharacterStandings, type CharacterStanding } from '@/esi/endpoints';
import { loadWithCache } from '@/esi/cache';

const KEY = 'standings';

export function loadCharacterStandings(characterId: number): Promise<CharacterStanding[]> {
  return loadWithCache(
    characterId,
    KEY,
    async () => (await getCharacterStandings(characterId)).data,
    { detectAuthFailure: () => false }
  ).then((result) => result?.data ?? []);
}
