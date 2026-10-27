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
 * A third read, `/roles`, feeds the roster's optional roles column (issue
 * #1766). Same scope as `/members`, so the Director reading this page already
 * holds it.
 *
 * Every key goes through `corpRead.ts`'s corp-scoped wrapper (issue #293), and a
 * 403 is the in-game role gate rather than a re-login (`corpAuthFailure.ts`).
 *
 * The name/ship/location resolution below is the other half of this module.
 * AC3 is a bound on *calls*, not on ids: a 200-member corp must not fan out to
 * 200 requests, so characters and NPC locations go through the bulk resolvers.
 * Upwell structures have no bulk endpoint, so deduplication is the only thing
 * that thins them — and for a corp genuinely spread across a hundred of them it
 * thins nothing. Those go out capped rather than all at once (issue #655): the
 * cap bounds how many are in flight, not how many are asked for.
 */
import { conditionalPagedFetch, conditionalFetch } from '@/esi/cache';
import {
  getCorporationMemberRoles,
  getCorporationMembers,
  getCorporationMemberTracking,
  type CorporationMemberRoles,
  type CorporationMemberTracking,
} from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { loadPublicCorporationRecord } from '@/features/character/publicInfoData';
import { loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import type { MemberActivity } from '@/engine/corp/members';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import { loadCorpPaginatedWithCacheStatus, loadCorpWithCacheStatus } from './corpRead';

export const KEYS = {
  members: 'members',
  tracking: 'membertracking',
  roles: 'roles',
} as const;

/** Character ids of every member. Paginated; the diff's input. */
export function loadCorporationMemberIds(
  characterId: number,
  corporationId: number
): Promise<StatusResult<number[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationMembers(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEYS.members, fetchLive, {
    conditional,
  });
}

/** Per-member session dates, ship and location. Director-only, server-side. */
export function loadCorporationMemberTracking(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMemberTracking[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationMemberTracking(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, KEYS.tracking, fetchLive, {
    conditional,
  });
}

/** Every member's in-game roles, for the roster's optional roles column. */
export function loadCorporationMemberRoles(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMemberRoles[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationMemberRoles(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, KEYS.roles, fetchLive, {
    conditional,
  });
}

/**
 * Each member's corporation-wide roles, by character id. The `_at_hq` /
 * `_at_base` / `_at_other` grants are left out for the reason `roles.ts`'s
 * `corpWideRoles` gives. An omitted array is no roles; a member missing from
 * the map is unknown.
 */
export function toMemberRoles(
  rows: readonly CorporationMemberRoles[]
): ReadonlyMap<number, readonly string[]> {
  return new Map(rows.map((row) => [row.character_id, row.roles ?? []]));
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
 * Location names for the distinct places the roster is standing in.
 *
 * Deduplication cuts the count but does not bound it: a corp spread across
 * nullsec stands in as many distinct Upwell structures as it holds, and each is
 * its own `/universe/structures/{id}` because they have no bulk endpoint. So
 * the structure half goes out at `ESI_FANOUT_CONCURRENCY` — the policy
 * `features/corp/assets.ts` took in issue #420, which this call site was missed
 * by until issue #655.
 *
 * Worth being exact about what that cap buys, because a structure the reading
 * Character is off the ACL of answers 403 and ESI counts every non-2xx against
 * one global 100-per-minute budget: ten in flight rather than a hundred does
 * not on its own keep a hundred refusals inside that budget. Memoizing the
 * refusal and an app-wide breaker are what do, and both are separate items on
 * #655. The cap's own job is the smaller one — this page stops dumping its
 * whole burst at once on top of every other read the app has in flight.
 *
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

  const names = await resolveNames(bulkIds);
  await mapWithConcurrencyLimit(structureIds, ESI_FANOUT_CONCURRENCY, async (id) => {
    const name = await loadStructureName(characterId, id);
    if (name !== null) names.set(id, name);
  });
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
    resolveNames([...members.map((member) => member.characterId), ...extraCharacterIds]),
    // SDE snapshot first, ESI only for what it misses — `typeNames.ts`.
    loadTypeNames(shipTypeIds),
    resolveLocationNames(characterId, locationIds),
  ]);
  return { characters, ships, locations };
}

/**
 * The corporation's CEO, from its public record (`ceo_id`). ESI role lists
 * call the CEO a Director; this is the only place the CEO is named. Null when
 * the record is unreadable: the CEO pill is then absent, never wrong.
 */
export async function loadCorporationCeoId(corporationId: number): Promise<number | null> {
  try {
    return (await loadPublicCorporationRecord(corporationId))?.ceo_id ?? null;
  } catch {
    return null;
  }
}
