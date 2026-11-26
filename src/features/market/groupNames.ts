import { getUniverseGroup } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

function cacheKey(groupId: number): string {
  return `group:${groupId}`;
}

export async function loadGroupNames(groupIds: readonly number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const unique = [...new Set(groupIds)];
  if (unique.length === 0) return names;

  const cached = await readCachedEntries<string>(GLOBAL_CACHE_CHARACTER_ID, unique.map(cacheKey));
  const missing: number[] = [];
  for (const id of unique) {
    const row = cached.get(cacheKey(id));
    if (row === undefined) missing.push(id);
    else names.set(id, row.value);
  }
  if (missing.length === 0) return names;

  const fetchedAt = Date.now();
  const resolved: Array<readonly [string, string]> = [];
  await mapWithConcurrencyLimit(missing, ESI_FANOUT_CONCURRENCY, async (id) => {
    try {
      const { data } = await getUniverseGroup(id);
      if (!data) return;
      names.set(id, data.name);
      resolved.push([cacheKey(id), data.name]);
    } catch {}
  });
  try {
    await writeCachedMany(GLOBAL_CACHE_CHARACTER_ID, resolved, fetchedAt);
  } catch {}
  return names;
}
