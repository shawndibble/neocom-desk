// Its own module so pure loaders can use it without `useGrantedScopes`'s store imports.
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';

/**
 * Ids of the tracked Characters whose stored grant covers every one of
 * `scopes`, in id order. `characterIds` narrows the lookup to those Characters
 * (an unknown id is left out). Only ids leave the token read, so no
 * `TokenRecord` reaches feature code (ADR 0001).
 */
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

/**
 * Live `characterIdsWithScopes`, as a `Set`; `undefined` until the first read.
 * Keyed by value: callers may rebuild the arrays every render.
 */
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
