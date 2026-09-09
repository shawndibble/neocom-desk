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
 *
 * A refusal is cached too, and has to be. A 403 writes no row, so without a
 * memo of its own every caller re-asked on every visit — and the callers are
 * fan-outs over *distinct locations*: a corp whose assets or members are
 * spread across a hundred citadels the reading Character is not on the ACL of
 * spent a hundred 403s per page load, forever. ESI's error limit is 100
 * non-2xx responses per minute applied across *every* route, so a big enough
 * corp could throttle the whole app out of one roster render. The nearby
 * `heldAfterFailure` in `esi/cache.ts` does not cover this: it is skipped for
 * `STALE_AFTER.static` keys, and it needs a stale row to hold, which a
 * structure that has only ever been refused does not have.
 */
import { AuthError } from '@/auth/sso';
import { getUniverseStructure, type UniverseStructure } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import {
  loadWithCache,
  readCached,
  readCachedEntries,
  writeCached,
  STALE_AFTER,
} from '@/esi/cache';

function cacheKey(structureId: number): string {
  return `structure:${structureId}`;
}

/**
 * Where the refusal is recorded — a sibling row rather than a field inside the
 * name row, because the two are alternatives: a structure has a stored name or
 * a stored refusal, never both at once from the same read. It sorts inside the
 * same `[characterId+key]` range `cachePurge.ts` deletes, so a scope revoke or
 * an owner change clears it along with everything else this Character cached.
 */
function forbiddenKey(structureId: number): string {
  return `structure:${structureId}:forbidden`;
}

/**
 * Deliberately the same window as the name itself.
 *
 * Both rows answer one question — what this Character can see of this
 * structure — so putting the positive and negative halves on different clocks
 * would be the surprising thing. It inherits the tradeoff the positive half
 * already makes and the app already accepts: a Character who *gains* ACL
 * access sees the name up to a day late, exactly as a Character who *loses* it
 * keeps seeing the cached name up to a day on.
 */
const FORBIDDEN_MEMO_MS = STALE_AFTER.static;

/** Has this Character asked for this structure recently and been refused? */
async function isKnownForbidden(characterId: number, structureId: number): Promise<boolean> {
  const key = forbiddenKey(structureId);
  const row = (await readCachedEntries<true>(characterId, [key])).get(key);
  return row !== undefined && Date.now() - row.fetchedAt < FORBIDDEN_MEMO_MS;
}

async function loadStructure(
  characterId: number,
  structureId: number
): Promise<UniverseStructure | null> {
  // Not an early `return null`: this stands in for the request, so it has to
  // answer the way the request would have. A Character who has lost ACL access
  // still gets the name they cached while they had it, because that is what a
  // live 403 does here today (`loadWithCacheStatus` falls back to the stored
  // row on any failure it does not treat as an auth failure).
  if (await isKnownForbidden(characterId, structureId)) {
    return (await readCached<UniverseStructure>(characterId, cacheKey(structureId))) ?? null;
  }

  const result = await loadWithCache(
    characterId,
    cacheKey(structureId),
    async () => {
      try {
        return (await getUniverseStructure(characterId, structureId)).data;
      } catch (err) {
        // Only a 403. A 5xx, a timeout or an offline device says nothing about
        // the ACL, and memoizing one as a refusal would hide a name for a day
        // over a blip.
        if (err instanceof EsiError && err.status === 403) {
          await writeCached(characterId, forbiddenKey(structureId), true, Date.now());
        }
        throw err;
      }
    },
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
