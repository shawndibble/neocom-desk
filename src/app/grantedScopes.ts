// Pure scope reads: no store imports, so data loaders can use it (see useGrantedScopes for the active Character).
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';

/*
 * Both helpers answer with a `Set`: every caller asks "does this grant hold scope X",
 * which a Set answers directly, and the array callers need only a spread. Only scopes
 * leave the token read, so no `TokenRecord` reaches feature code (ADR 0001).
 */

/** The scopes `characterId`'s stored grant holds; empty when there is no token row. */
export async function loadGrantedScopes(characterId: number): Promise<ReadonlySet<string>> {
  return new Set((await db.tokens.get(characterId))?.scopes ?? []);
}

/** Every stored Character's granted scopes, keyed by Character id. */
export async function loadGrantedScopesByCharacter(): Promise<
  ReadonlyMap<number, ReadonlySet<string>>
> {
  const tokens = await db.tokens.toArray();
  return new Map(tokens.map((token) => [token.characterId, new Set(token.scopes ?? [])]));
}

/** Live `loadGrantedScopesByCharacter`; `undefined` until the first read. */
export function useGrantedScopesByCharacter():
  ReadonlyMap<number, ReadonlySet<string>> | undefined {
  return useLiveQuery(loadGrantedScopesByCharacter, []);
}
