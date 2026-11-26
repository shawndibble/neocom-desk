import { getCharacterStandings, type CharacterStanding } from '@/esi/endpoints';
import { conditionalFetch, invalidateFreshness, loadWithCache } from '@/esi/cache';
import { ESI_REGISTRY } from '@/esi/registry';
import { db } from '@/db';

const KEY = 'standings';
const STANDINGS_SCOPE = ESI_REGISTRY.getCharacterStandings.scope;

export interface CharacterStandingsResult {
  entries: CharacterStanding[];
  fetchedAt: Date | null;
  fromCache: boolean;
  available: boolean;
}

export async function loadCharacterStandingsResult(
  characterId: number,
  options: { force?: boolean } = {}
): Promise<CharacterStandingsResult> {
  const token = await db.tokens.get(characterId);
  if (token && !(token.scopes ?? []).includes(STANDINGS_SCOPE)) {
    return { entries: [], fetchedAt: null, fromCache: false, available: false };
  }
  if (options.force) invalidateFreshness();
  const { fetchLive, conditional } = conditionalFetch((fetchOptions) =>
    getCharacterStandings(characterId, fetchOptions)
  );
  const result = await loadWithCache(characterId, KEY, fetchLive, {
    detectAuthFailure: () => false,
    conditional,
  });
  return {
    entries: result?.data ?? [],
    fetchedAt: result?.fetchedAt ?? null,
    fromCache: result?.fromCache ?? false,
    available: result !== null,
  };
}

export async function loadCharacterStandings(characterId: number): Promise<CharacterStanding[]> {
  return (await loadCharacterStandingsResult(characterId)).entries;
}
