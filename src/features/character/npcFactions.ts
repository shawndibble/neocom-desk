/**
 * The pirate faction behind each NPC type a bounty paid out on, for the wallet
 * journal's bounty lines. EVE carries no faction on the type itself, and the
 * SDE snapshot carries neither NPC types nor item Groups, so: the type's
 * `group_id` from `GET /universe/types/{id}`, that Group's name through
 * `loadGroupNames`, and `pirateFactionOf` on the name.
 *
 * The typeID -> groupID step is cached in `esiCache` like `groupNames.ts`,
 * cache-first with no freshness window — an NPC doesn't change Group. Lookups
 * in flight are shared: a journal renders dozens of bounty lines at once, all
 * killing the same handful of rats, and without that each would fan out its
 * own GETs for the same ids before the first had cached anything.
 */
import { getUniverseType } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadGroupNames } from '@/features/market/groupNames';
import { pirateFactionOf } from './bountyKills';

function cacheKey(typeId: number): string {
  return `typeGroup:${typeId}`;
}

/** Each type's whole lookup, shared while it runs — see the header. */
const inFlight = new Map<number, Promise<string | null>>();

/** GroupIDs for types not yet cached; null for any ESI couldn't resolve. Never rejects. */
async function fetchGroupIds(typeIds: number[]): Promise<Map<number, number | null>> {
  const groups = new Map<number, number | null>();
  const resolved: Array<readonly [string, number]> = [];
  const fetchedAt = Date.now();
  await mapWithConcurrencyLimit(typeIds, ESI_FANOUT_CONCURRENCY, async (id) => {
    try {
      const { data } = await getUniverseType(id);
      groups.set(id, data ? data.group_id : null);
      if (data) resolved.push([cacheKey(id), data.group_id]);
    } catch {
      groups.set(id, null);
    }
  });
  try {
    await writeCachedMany(GLOBAL_CACHE_CHARACTER_ID, resolved, fetchedAt);
  } catch {
    // A failed write only costs a later lookup its cache hit.
  }
  return groups;
}

/** Type -> Group (cache, then ESI) -> Group name -> faction, for one batch of types. */
async function resolveFactions(typeIds: number[]): Promise<Map<number, string | null>> {
  const groupIds = new Map<number, number | null>();
  const cached = await readCachedEntries<number>(GLOBAL_CACHE_CHARACTER_ID, typeIds.map(cacheKey));
  const uncached: number[] = [];
  for (const id of typeIds) {
    const row = cached.get(cacheKey(id));
    if (row === undefined) uncached.push(id);
    else groupIds.set(id, row.value);
  }
  if (uncached.length > 0) {
    for (const [id, groupId] of await fetchGroupIds(uncached)) groupIds.set(id, groupId);
  }
  const known = [...groupIds.values()].filter((id): id is number => id !== null);
  const groupNames = await loadGroupNames(known);
  const factions = new Map<number, string | null>();
  for (const id of typeIds) {
    const groupId = groupIds.get(id);
    const name = groupId == null ? undefined : groupNames.get(groupId);
    factions.set(id, name === undefined ? null : pirateFactionOf(name));
  }
  return factions;
}

/**
 * Each type's pirate faction, keyed by typeID; null when it has none or
 * couldn't be resolved. Never rejects.
 */
export async function loadNpcFactions(
  typeIds: readonly number[]
): Promise<Map<number, string | null>> {
  const unique = [...new Set(typeIds)];
  const notInFlight = unique.filter((id) => !inFlight.has(id));
  if (notInFlight.length > 0) {
    const batch = resolveFactions(notInFlight).catch(() => new Map<number, string | null>());
    for (const id of notInFlight) {
      const one = batch.then((factions) => factions.get(id) ?? null);
      inFlight.set(id, one);
      void one.finally(() => inFlight.delete(id));
    }
  }
  const factions = new Map<number, string | null>();
  await Promise.all(
    unique.map(async (id) => {
      factions.set(id, (await inFlight.get(id)) ?? null);
    })
  );
  return factions;
}
