import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';

export async function loadGrantedScopes(characterId: number): Promise<ReadonlySet<string>> {
  return new Set((await db.tokens.get(characterId))?.scopes ?? []);
}

export async function loadGrantedScopesByCharacter(): Promise<
  ReadonlyMap<number, ReadonlySet<string>>
> {
  const tokens = await db.tokens.toArray();
  return new Map(tokens.map((token) => [token.characterId, new Set(token.scopes ?? [])]));
}

export function useGrantedScopesByCharacter():
  ReadonlyMap<number, ReadonlySet<string>> | undefined {
  return useLiveQuery(loadGrantedScopesByCharacter, []);
}
