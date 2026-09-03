/**
 * Fetch + cache layer for the active Character's own corporation roles.
 *
 * The read that makes honest corp gating possible: scopes are knowable offline
 * from the JWT, roles are not, and CCP gates the corporation endpoints on roles
 * server-side. Without this, a non-Director would be shown a `ReauthBanner`
 * over a 403 that logging in again could never fix (`ScopeGate.tsx`).
 *
 * Cheap enough to run for everyone: one small object, an hour of server-side
 * cache, and no role gate of its own.
 */
import { getCharacterRoles, type CharacterCorporationRoles } from '@/esi/endpoints';
import { loadWithCacheStatus, type StatusResult } from '@/esi/cache';

const KEY = 'corpRoles';

/**
 * The Character's own corporation roles. ESI or cache, with the auth-failure
 * state exposed for parity with every other data module — though `useCorpAccess`
 * deliberately does not surface it: an unprovable role is simply no corp UI,
 * not an error (CONTEXT.md round 35).
 */
export function loadCharacterRoles(
  characterId: number
): Promise<StatusResult<CharacterCorporationRoles>> {
  return loadWithCacheStatus(
    characterId,
    KEY,
    async () => (await getCharacterRoles(characterId)).data
  );
}

/**
 * The corporation-wide role list, defaulted — the only field the capability
 * mapping reads.
 *
 * ESI omits an array rather than sending `[]`, so "no roles" arrives as a
 * missing field on an otherwise valid 200. The `roles_at_hq` / `roles_at_base`
 * / `roles_at_other` variants are deliberately ignored: those grants apply at
 * one office, and the corporation-wide endpoints behind each capability do not
 * accept them.
 */
export function corpWideRoles(
  payload: CharacterCorporationRoles | null | undefined
): readonly string[] {
  return payload?.roles ?? [];
}
