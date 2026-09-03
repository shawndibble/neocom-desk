/**
 * Fetch + cache layer for the corporation roster (issue #297).
 *
 * Two reads, because ESI splits the roster in two and role-gates the halves
 * differently: `/members` is a bare id list, and `/membertracking` is where the
 * dates, ship and location live. Only the second answers the page's question,
 * and only a Director may ask it — which is why `canReadMembers` maps to
 * `Director` alone (`engine/corpRoles.ts`) and the route hides for everyone
 * else rather than degrading panel by panel the way `/corp` does.
 *
 * The id list is still worth its own call: it is the input to the roster diff,
 * and it names members who have *left*, who by definition no longer appear in
 * tracking.
 *
 * Both keys go through `corpCacheKey` (issue #293), and a 403 is the in-game
 * role gate rather than a re-login (`corpAuthFailure.ts`).
 *
 * The name/ship/location resolution below is the other half of this module.
 * AC3 is a bound on *calls*, not on ids: a 200-member corp must not fan out to
 * 200 requests, so characters and NPC locations go through the bulk resolvers
 * and Upwell structures are deduplicated down to the handful a corp actually
 * docks in.
 */
import {
  getCorporationMembers,
  getCorporationMemberTracking,
  type CorporationMemberTracking,
} from '@/esi/endpoints';
import {
  corpCacheKey,
  loadPaginatedWithCacheStatus,
  loadWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import type { MemberActivity } from '@/engine/corp/members';
import { detectCorpAuthFailure } from './corpAuthFailure';

export const KEYS = {
  members: 'members',
  tracking: 'membertracking',
} as const;

const CORP_OPTIONS = { detectAuthFailure: detectCorpAuthFailure };

/** Character ids of every member. Paginated; the diff's input. */
export function loadCorporationMemberIds(
  characterId: number,
  corporationId: number
): Promise<StatusResult<number[]>> {
  return loadPaginatedWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, KEYS.members),
    () => getCorporationMembers(characterId, corporationId),
    CORP_OPTIONS
  );
}

/** Per-member session dates, ship and location. Director-only, server-side. */
export function loadCorporationMemberTracking(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMemberTracking[]>> {
  return loadWithCacheStatus(
    characterId,
    corpCacheKey(corporationId, KEYS.tracking),
    async () => (await getCorporationMemberTracking(characterId, corporationId)).data,
    CORP_OPTIONS
  );
}

/** ESI's ISO string to epoch ms; null for absent *and* for unparseable. */
function toMs(date: string | undefined): number | null {
  if (date === undefined) return null;
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The boundary adaptation (ARCHITECTURE.md): ESI's optional ISO strings become
 * the engine's nullable epoch milliseconds, and nothing downstream of here
 * parses a date again.
 */
export function toMemberActivity(rows: readonly CorporationMemberTracking[]): MemberActivity[] {
  return rows.map((row) => ({
    characterId: row.character_id,
    logonMs: toMs(row.logon_date),
    logoffMs: toMs(row.logoff_date),
    startMs: toMs(row.start_date),
    shipTypeId: row.ship_type_id ?? null,
    locationId: row.location_id ?? null,
  }));
}

/**
 * The lowest id CCP issues to an Upwell structure.
 *
 * `membertracking`'s `location_id` carries no `location_type`, the same gap
 * `contractLocationName.ts` works around — but that module has one id to
 * resolve and can afford to try both endpoints in turn, while this one has as
 * many distinct locations as the corp is spread across. So the id space is
 * split up front instead: everything below this floor is an NPC station or a
 * solar system, which `/universe/names` resolves in a single batch, and
 * everything at or above it is a structure, which has no bulk endpoint at all.
 *
 * Splitting the other way round is not an option: `/universe/names` answers 404
 * for the *whole* batch if any one id is unresolvable, so a single structure id
 * mixed in would cost every location name on the page.
 */
const UPWELL_STRUCTURE_ID_FLOOR = 1_000_000_000_000;

/** `/universe/names` takes at most this many ids per call. */
const UNIVERSE_NAMES_BATCH = 1000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Character names for a roster of any size.
 *
 * `resolveNames` is the app's one bulk resolver and is used as it is; the only
 * thing added here is the batch limit, because a corporation can hold more
 * members than `/universe/names` accepts in one call and an alliance holding
 * corp routinely does.
 */
async function resolveMemberNames(ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  const names = new Map<number, string>();
  for (const batch of chunk(unique, UNIVERSE_NAMES_BATCH)) {
    for (const [id, name] of await resolveNames(batch)) names.set(id, name);
  }
  return names;
}

/**
 * Location names for the distinct places the roster is standing in.
 *
 * Deduplicated first, which is what makes this bounded in practice: two hundred
 * members share a home structure and a trade hub, not two hundred addresses.
 * A structure the reading Character is not on the ACL for resolves to nothing
 * and the view falls back to the raw id, exactly as Assets does.
 */
async function resolveLocationNames(
  characterId: number,
  locationIds: readonly number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(locationIds)];
  const structureIds = unique.filter((id) => id >= UPWELL_STRUCTURE_ID_FLOOR);
  const bulkIds = unique.filter((id) => id < UPWELL_STRUCTURE_ID_FLOOR);

  const names = await resolveMemberNames(bulkIds);
  const structureNames = await Promise.all(
    structureIds.map(async (id) => [id, await loadStructureName(characterId, id)] as const)
  );
  for (const [id, name] of structureNames) {
    if (name !== null) names.set(id, name);
  }
  return names;
}

/** Every label the roster table prints, resolved in as few calls as ESI allows. */
export interface MemberLabels {
  characters: ReadonlyMap<number, string>;
  ships: ReadonlyMap<number, string>;
  locations: ReadonlyMap<number, string>;
}

export const EMPTY_MEMBER_LABELS: MemberLabels = {
  characters: new Map(),
  ships: new Map(),
  locations: new Map(),
};

/**
 * Resolves every id the page shows.
 *
 * `extraCharacterIds` carries the members who have *left*: the joins/leaves
 * summary names them, and they are gone from both the tracking read and the
 * current roster, so nothing else on the page would ask for their names.
 */
export async function loadMemberLabels(
  characterId: number,
  members: readonly MemberActivity[],
  extraCharacterIds: readonly number[] = []
): Promise<MemberLabels> {
  const shipTypeIds = members
    .map((member) => member.shipTypeId)
    .filter((id): id is number => id !== null);
  const locationIds = members
    .map((member) => member.locationId)
    .filter((id): id is number => id !== null);

  const [characters, ships, locations] = await Promise.all([
    resolveMemberNames([...members.map((member) => member.characterId), ...extraCharacterIds]),
    // SDE snapshot first, ESI only for what it misses — `typeNames.ts`.
    loadTypeNames(shipTypeIds),
    resolveLocationNames(characterId, locationIds),
  ]);
  return { characters, ships, locations };
}
