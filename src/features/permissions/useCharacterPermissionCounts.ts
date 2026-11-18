import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { countGrantedPermissions, type CharacterPermissionCount } from './permissionCounts';
import { loadGrantedScopesByCharacter } from '@/app/grantedScopes';

/**
 * Every tracked Character with how many Permissions it has granted, live, in
 * the order they were added; `undefined` until the first read. A Character
 * with no token row counts as granting nothing. Only ids, names and counts
 * leave the read (ADR 0001).
 */
export function useCharacterPermissionCounts(): readonly CharacterPermissionCount[] | undefined {
  return useLiveQuery(async () => {
    const [characters, scopesById] = await Promise.all([
      db.characters.toArray(),
      loadGrantedScopesByCharacter(),
    ]);
    return [...characters]
      .sort((a, b) => a.addedAt - b.addedAt)
      .map((character) => ({
        characterId: character.characterId,
        name: character.name,
        ...countGrantedPermissions([...(scopesById.get(character.characterId) ?? [])]),
      }));
  });
}
