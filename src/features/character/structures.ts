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
import { getUniverseStructure, type UniverseStructure } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import { loadWithCache, STALE_AFTER } from '@/esi/cache';

function cacheKey(structureId: number): string {
  return `structure:${structureId}`;
}

async function loadStructure(
  characterId: number,
  structureId: number
): Promise<UniverseStructure | null> {
  const result = await loadWithCache(
    characterId,
    cacheKey(structureId),
    async () => (await getUniverseStructure(characterId, structureId)).data,
    {
      detectAuthFailure: (err) =>
        err instanceof AuthError || (err instanceof EsiError && err.status === 401),
      // A structure can be renamed, but rarely, and the Assets tree resolves
      // one per distinct location — refetching them on the 10-minute cadence
      // would make every Assets visit a fan-out for names that did not move.
      staleAfterMs: STALE_AFTER.static,
    }
  );
  return result?.data ?? null;
}

/** Structure name, or null if unresolvable (no ACL access, offline, or uncached). */
export async function loadStructureName(
  characterId: number,
  structureId: number
): Promise<string | null> {
  return (await loadStructure(characterId, structureId))?.name ?? null;
}

/** Structure's solar system id, for jumps-away distances (issue #87), or null if unresolvable. */
export async function loadStructureSystemId(
  characterId: number,
  structureId: number
): Promise<number | null> {
  return (await loadStructure(characterId, structureId))?.solar_system_id ?? null;
}

/**
 * Everything the Build Plan's location search needs from one structure, off
 * the same cached row `loadStructureName` reads. `null` for a structure this
 * character is not on the ACL of — a normal outcome, never an auth failure.
 */
export async function loadStructureSummary(
  characterId: number,
  structureId: number
): Promise<{ name: string; systemId: number; typeId: number } | null> {
  const structure = await loadStructure(characterId, structureId);
  // `type_id` is optional in ESI's own schema; without it there is no facility
  // preset to map to, which is the whole reason the search wants the row.
  if (!structure || structure.type_id === undefined) return null;
  return {
    name: structure.name,
    systemId: structure.solar_system_id,
    typeId: structure.type_id,
  };
}
