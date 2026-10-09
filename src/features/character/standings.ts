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
import { conditionalFetch, invalidateFreshness, loadWithCache } from '@/esi/cache';
import { ESI_REGISTRY } from '@/esi/registry';
import { db } from '@/db';

const KEY = 'standings';
const STANDINGS_SCOPE = ESI_REGISTRY.getCharacterStandings.scope;

export interface CharacterStandingsResult {
  entries: CharacterStanding[];
  /** When the list was last fetched; null when nothing was loaded (no scope, or no cache and no live answer). */
  fetchedAt: Date | null;
}

/** `force` is a manual Refresh: it bypasses the cache freshness window for a live fetch. */
export async function loadCharacterStandingsResult(
  characterId: number,
  options: { force?: boolean } = {}
): Promise<CharacterStandingsResult> {
  const token = await db.tokens.get(characterId);
  // `scopes` post-dates the tokens table (app/useGrantedScopes.ts), so an old row may lack it.
  if (token && !(token.scopes ?? []).includes(STANDINGS_SCOPE)) {
    return { entries: [], fetchedAt: null };
  }
  if (options.force) invalidateFreshness();
  const { fetchLive, conditional } = conditionalFetch((fetchOptions) =>
    getCharacterStandings(characterId, fetchOptions)
  );
  const result = await loadWithCache(characterId, KEY, fetchLive, {
    detectAuthFailure: () => false,
    conditional,
  });
  return { entries: result?.data ?? [], fetchedAt: result?.fetchedAt ?? null };
}

export async function loadCharacterStandings(characterId: number): Promise<CharacterStanding[]> {
  return (await loadCharacterStandingsResult(characterId)).entries;
}
