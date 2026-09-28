/**
 * Item **Group** names (`invGroups`) for the dogma attributes that reference a
 * Group by id — "Used with (Charge Group)", "Can be fitted to",
 * "Asteroid Specialization Group". Distinct from a Market Group (CONTEXT.md):
 * the build-time SDE snapshot carries the market tree, not this taxonomy, so
 * there is no local map to read and no batch endpoint to read it with
 * (`POST /universe/names` resolves inventory *types*, not groups).
 *
 * So: one `GET /universe/groups/{id}` per id, at the shared fan-out limit,
 * cached in the generic `esiCache` under the global sentinel (`esi/cache`) —
 * and read cache-first, without a freshness window. Deliberately not
 * `STALE_AFTER.static`: even that 24h window would spend a live call per
 * distinct Group per day, on a taxonomy that changes when CCP ships an
 * expansion, to refresh a name the row would render identically. The cost of
 * being wrong is a renamed Group reading stale until the cache is cleared. An id that resolves to nothing is simply absent from the returned
 * map: `groupItemAttributes` then leaves that row as the raw value it renders
 * today rather than inventing a label. Item Detail already reads ESI on open
 * (CONTEXT.md round 6), and this endpoint is public, so `/market`'s
 * zero-scope guarantee holds.
 */
import { getUniverseGroup } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

function cacheKey(groupId: number): string {
  return `group:${groupId}`;
}

/** Group names for many groupIDs at once, keyed by groupID; unresolvable ids are omitted. */
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
      if (!data) return; // 304 Not Modified: unreachable, no etag is ever sent here.
      names.set(id, data.name);
      resolved.push([cacheKey(id), data.name]);
    } catch {
      // Genuinely unresolvable, or offline: left out of the map, and the row
      // keeps rendering its raw id.
    }
  });
  await writeCachedMany(GLOBAL_CACHE_CHARACTER_ID, resolved, fetchedAt);
  return names;
}
