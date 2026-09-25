/**
 * Fetch + cache layer for a character's NPC standings (issue #1238), used to
 * resolve the broker-fee reduction at NPC stations.
 *
 * `esi-characters.read_standings.v1` was added to the base grant after some
 * characters already logged in, so a token can lack it. This loader still
 * falls back to "assume 0 standing" rather than failing — `detectAuthFailure`
 * always returns false, so a 401/403 is an ordinary "nothing cached, fall
 * back to []" case. What tells the user is `app/StandingsScopeNotice.tsx`,
 * driven by the stored grant: `esi/cache.ts`'s `isWorthReportingToShell`
 * never lets a scope the grant did not claim reach the shell notice.
 *
 * A token whose stored grant lacks the scope is not called at all — ESI would
 * only answer 401 — so a pre-scope login no longer floods the console. A
 * missing token row is unknown, not "lacks the scope", and still fetches.
 */
import { getCharacterStandings, type CharacterStanding } from '@/esi/endpoints';
import { loadWithCache } from '@/esi/cache';
import { ESI_REGISTRY } from '@/esi/registry';
import { db } from '@/db';

const KEY = 'standings';
const STANDINGS_SCOPE = ESI_REGISTRY.getCharacterStandings.scope;

export async function loadCharacterStandings(characterId: number): Promise<CharacterStanding[]> {
  const token = await db.tokens.get(characterId);
  // `scopes` post-dates the tokens table (app/useGrantedScopes.ts), so an old row may lack it.
  if (token && !(token.scopes ?? []).includes(STANDINGS_SCOPE)) return [];
  const result = await loadWithCache(
    characterId,
    KEY,
    async () => (await getCharacterStandings(characterId)).data,
    { detectAuthFailure: () => false }
  );
  return result?.data ?? [];
}
