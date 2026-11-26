import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { countGrantedPermissions, type CharacterPermissionCount } from './permissionCounts';
import { loadGrantedScopesByCharacter } from '@/app/grantedScopes';

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
