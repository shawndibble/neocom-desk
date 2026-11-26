import { getCharacterRoles, type CharacterCorporationRoles } from '@/esi/endpoints';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'corpRoles';

export function loadCharacterRoles(
  characterId: number
): Promise<StatusResult<CharacterCorporationRoles>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterRoles(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

export function corpWideRoles(
  payload: CharacterCorporationRoles | null | undefined
): readonly string[] {
  return payload?.roles ?? [];
}

export function corpRoleLabel(role: string): string {
  return role.replace(/_/g, ' ');
}

export function rolesText(roles: readonly string[] | null): string | null {
  if (roles === null || roles.length === 0) return null;
  return roles
    .map(corpRoleLabel)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}
