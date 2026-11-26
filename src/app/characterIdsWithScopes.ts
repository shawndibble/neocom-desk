import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';

export async function characterIdsWithScopes(
  scopes: readonly string[],
  characterIds?: readonly number[]
): Promise<number[]> {
  const tokens =
    characterIds === undefined
      ? await db.tokens.toArray()
      : (await db.tokens.bulkGet([...characterIds])).filter((token) => token !== undefined);
  return tokens
    .filter((token) => scopes.every((scope) => (token.scopes ?? []).includes(scope)))
    .map((token) => token.characterId);
}

export function useCharacterIdsWithScopes(
  scopes: readonly string[],
  characterIds?: readonly number[]
): ReadonlySet<number> | undefined {
  const scopesKey = scopes.join(',');
  const idsKey = characterIds?.join(',');
  return useLiveQuery(
    async () => new Set(await characterIdsWithScopes(scopes, characterIds)),
    [scopesKey, idsKey]
  );
}
