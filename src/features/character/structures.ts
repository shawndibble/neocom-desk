/**
 * Structure name lookups: GET /universe/structures/{id} needs
 * esi-universe.read_structures.v1 and is ACL-checked per structure — ESI's
 * own spec: "Returns information on requested structure if you are on the
 * ACL. Otherwise, returns 'Forbidden' for all inputs." So a 403 here is a
 * normal outcome for a structure the character can't see into, even when the
 * token holds the scope, and must never be treated as "log in again" — that
 * would pin the shell-wide reauth notice permanently with no re-login able to
 * fix it. Only a 401 (or a failed token refresh) is a real auth failure.
 *
 * Cached per character, not under the global sentinel: unlike an NPC station,
 * a structure's visibility is genuinely ACL-gated, so caching a resolved name
 * globally would leak it to a character not on that ACL.
 */
import { AuthError } from '@/auth/sso';
import { getUniverseStructure } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import { loadWithCache } from '@/esi/cache';

function cacheKey(structureId: number): string {
  return `structure:${structureId}`;
}

/** Structure name, or null if unresolvable (no ACL access, offline, or uncached). */
export async function loadStructureName(
  characterId: number,
  structureId: number
): Promise<string | null> {
  const result = await loadWithCache(
    characterId,
    cacheKey(structureId),
    async () => (await getUniverseStructure(characterId, structureId)).data,
    {
      detectAuthFailure: (err) =>
        err instanceof AuthError || (err instanceof EsiError && err.status === 401),
    }
  );
  return result?.data.name ?? null;
}
