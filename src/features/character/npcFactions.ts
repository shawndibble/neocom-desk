import { getUniverseType } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadGroupNames } from '@/features/market/groupNames';
import { pirateFactionOf } from './bountyKills';

function cacheKey(typeId: number): string {
  return `typeGroup:${typeId}`;
}

const inFlight = new Map<number, Promise<string | null>>();

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
  } catch {}
  return groups;
}

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
