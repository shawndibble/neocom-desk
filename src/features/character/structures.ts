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
 * A resolved name is written under the character that resolved it *and*
 * mirrored to the global sentinel row, so every other Character in this
 * browser's roster reads it with no ESI call of their own. That used to be
 * called out as a leak: the ACL is genuinely per-Character, so a name one
 * Character can see is not automatically one every Character should. What
 * changed is *who* the "every Character" is — every row here is scoped to
 * `db.characters`, i.e. only the Characters the person at this keyboard has
 * already added to their own app. Sharing a name across a person's own alts
 * once one of them proves ACL access is not exposing it to a stranger; it is
 * the same person's own client remembering what it already knows. (Issue
 * #655 follow-up.)
 *
 * A refusal is cached too, and has to be, on two levels:
 *
 * - Per Character (`forbiddenKey`): a 403 writes no name row, so without a
 *   memo of its own every caller re-asked on every visit — and the callers
 *   are fan-outs over *distinct locations*, so a corp spread across a
 *   hundred citadels the reading Character is not on the ACL of spent a
 *   hundred 403s per page load, forever.
 * - Roster-wide (`rosterForbiddenKey`): once every Character in the roster
 *   has been tried and refused, that is recorded too, so a citadel none of
 *   them can see is swept once a day *for the whole roster*, not once a day
 *   *per Character* — a roster of fifteen otherwise turns one forbidden
 *   structure into fifteen daily refusals instead of one.
 *
 * ESI's error limit is 100 non-2xx/3xx responses per minute applied across
 * *every* route, so a big enough corp could throttle the whole app out of one
 * roster render; both memos above exist to bound that, and every ESI call
 * this module makes (including the roster fallback's) still passes through
 * `esi/budget.ts`'s app-wide circuit, so a sweep that meets a spent budget
 * backs off or fails fast into the cache rather than adding to the storm. The
 * nearby `heldAfterFailure` in `esi/cache.ts` does not cover the per-Character
 * case on its own: it is skipped for `STALE_AFTER.static` keys, and it needs
 * a stale row to hold, which a structure that has only ever been refused does
 * not have. (Issue #655.)
 */
import { db } from '@/db';
import { AuthError } from '@/auth/sso';
import { getUniverseStructure, type UniverseStructure } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import {
  loadWithCache,
  readCached,
  readCachedEntries,
  writeCached,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
} from '@/esi/cache';

function cacheKey(structureId: number): string {
  return `structure:${structureId}`;
}

/**
 * Where the refusal is recorded — a sibling row rather than a field inside the
 * name row, because the two are alternatives: a structure has a stored name or
 * a stored refusal, never both at once from the same read.
 *
 * It sorts inside the `[characterId+key]` range `purgeCharacterCache` deletes,
 * so a scope revoke or an owner change clears it along with everything else
 * this Character cached. It is deliberately *not* `corp:`-prefixed, so
 * `purgeCorpScopedCache` leaves it alone on a corporation change — the same
 * treatment the `structure:{id}` name row gets, and the two have to agree. A
 * pilot who changes corp therefore waits out the window below before the new
 * corp's citadels resolve, exactly as they keep seeing the old corp's names
 * for that long.
 */
function forbiddenKey(structureId: number): string {
  return `structure:${structureId}:forbidden`;
}

/**
 * Recorded once every Character in the roster has been tried and refused
 * (see `resolveViaRoster`). Lives on the global sentinel row, same as the
 * shared name row `cacheKey` doubles as once resolved — this is a roster-wide
 * fact, not one Character's own ACL state, so it belongs beside the other
 * shared row rather than under any one `characterId`.
 */
function rosterForbiddenKey(structureId: number): string {
  return `structure:${structureId}:roster-forbidden`;
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

/**
 * The stored name and the stored refusal, in one read.
 *
 * Both keys go through a single `readCachedEntries` — one purge check and one
 * `bulkGet` — rather than a call each, which is the convention that function's
 * own docstring states. It matters more here than in most places: the caller is
 * a fan-out over every distinct location on a page, which is the traffic this
 * memo exists to cut.
 *
 * The freshness test is a bare age comparison rather than `esi/cache.ts`'s
 * `readFreshRow`, which is not exported and would pull the shared module into a
 * fix local to this file. Nothing it adds applies here: a `true` row carries no
 * `Expires` header to take the later of, and `isRefreshInvalidated` is a no-op
 * above `STALE_AFTER.default`, which `FORBIDDEN_MEMO_MS` is.
 */
async function readMemo(
  characterId: number,
  structureId: number
): Promise<{ forbidden: boolean; name: UniverseStructure | undefined }> {
  const nameKey = cacheKey(structureId);
  const refusalKey = forbiddenKey(structureId);
  const rows = await readCachedEntries<UniverseStructure | boolean>(characterId, [
    nameKey,
    refusalKey,
  ]);
  const refusal = rows.get(refusalKey);
  return {
    forbidden: refusal !== undefined && Date.now() - refusal.fetchedAt < FORBIDDEN_MEMO_MS,
    name: rows.get(nameKey)?.value as UniverseStructure | undefined,
  };
}

/**
 * One Character's own attempt, with no roster fallback — the leaf every
 * candidate in `resolveViaRoster`'s sweep calls, so trying the roster never
 * recurses into trying the roster again.
 *
 * `forbidden: true` means *this* Character is confirmed off the ACL (a fresh
 * 403, or a same-day memo of one) — the only condition worth spending the
 * rest of the roster on. Anything else (offline, a 5xx, nothing cached yet)
 * says nothing about the ACL, so it reports `forbidden: false` and callers
 * stop there instead of fanning out over every other Character for a blip.
 */
async function loadOwnStructure(
  characterId: number,
  structureId: number
): Promise<{ structure: UniverseStructure | null; forbidden: boolean }> {
  // Not an early `return null`: this stands in for the request, so it has to
  // answer the way the request would have. A Character who has lost ACL access
  // still gets the name they cached while they had it, because that is what a
  // live 403 does here today (`loadWithCacheStatus` falls back to the stored
  // row on any failure it does not treat as an auth failure).
  const memo = await readMemo(characterId, structureId);
  if (memo.forbidden) return { structure: memo.name ?? null, forbidden: true };

  let forbidden = false;
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
          forbidden = true;
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
  return { structure: result?.data ?? null, forbidden };
}

/**
 * Tried only after this Character is confirmed off the ACL. Sequential and
 * stopping at the first success, so it spends the fewest possible 403s
 * rather than always paying for the whole roster — every candidate that
 * already carries its own same-day refusal memo answers `loadOwnStructure`
 * without touching the network at all, so the calls that actually reach ESI
 * here are only the roster members being asked for the first time today.
 *
 * A miss across the whole roster is memoized on `rosterForbiddenKey` so the
 * next ask — by this Character or any other — skips the sweep entirely until
 * that memo lapses. Without it, a citadel none of the roster can see would be
 * swept again every time a *different* Character happened to hit it first
 * that day.
 */
async function resolveViaRoster(
  askingCharacterId: number,
  structureId: number
): Promise<UniverseStructure | null> {
  const memo = await readCachedEntries<boolean>(GLOBAL_CACHE_CHARACTER_ID, [
    rosterForbiddenKey(structureId),
  ]);
  const refusal = memo.get(rosterForbiddenKey(structureId));
  if (refusal !== undefined && Date.now() - refusal.fetchedAt < FORBIDDEN_MEMO_MS) return null;

  const others = (await db.characters.toArray())
    .map((character) => character.characterId)
    .filter((characterId) => characterId !== askingCharacterId);

  for (const characterId of others) {
    const { structure } = await loadOwnStructure(characterId, structureId);
    if (structure) return structure;
  }

  await writeCached(GLOBAL_CACHE_CHARACTER_ID, rosterForbiddenKey(structureId), true, Date.now());
  return null;
}

async function loadStructure(
  characterId: number,
  structureId: number
): Promise<UniverseStructure | null> {
  const shared = await readCached<UniverseStructure>(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(structureId)
  );
  if (shared) return shared;

  const own = await loadOwnStructure(characterId, structureId);
  const structure =
    own.structure ?? (own.forbidden ? await resolveViaRoster(characterId, structureId) : null);

  if (structure) {
    await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(structureId), structure, Date.now());
  }
  return structure;
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
