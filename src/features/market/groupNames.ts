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
 * a Group's name is a constant, so a hit is served without a live call rather
 * than on a freshness window, and the ids an item references dedupe to a
 * handful. An id that resolves to nothing is simply absent from the returned
 * map: `groupItemAttributes` then leaves that row as the raw value it renders
 * today rather than inventing a label. Item Detail already reads ESI on open
 * (CONTEXT.md round 6), and this endpoint is public, so `/market`'s
 * zero-scope guarantee holds.
 */
import { getUniverseGroup } from '@/esi/endpoints';
import { GLOBAL_CACHE_CHARACTER_ID, readCached, writeCached } from '@/esi/cache';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

function cacheKey(groupId: number): string {
  return `group:${groupId}`;
}

/** Group names for many groupIDs at once, keyed by groupID; unresolvable ids are omitted. */
export async function loadGroupNames(groupIds: readonly number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const unique = [...new Set(groupIds)];
  if (unique.length === 0) return names;

  const missing: number[] = [];
  for (const id of unique) {
    const cached = await readCached<string>(GLOBAL_CACHE_CHARACTER_ID, cacheKey(id));
    if (cached === undefined) missing.push(id);
    else names.set(id, cached);
  }
  if (missing.length === 0) return names;

  const fetchedAt = Date.now();
  await mapWithConcurrencyLimit(missing, ESI_FANOUT_CONCURRENCY, async (id) => {
    try {
      const { data } = await getUniverseGroup(id);
      if (!data) return; // 304 Not Modified: unreachable, no etag is ever sent here.
      names.set(id, data.name);
      await writeCached(GLOBAL_CACHE_CHARACTER_ID, cacheKey(id), data.name, fetchedAt);
    } catch {
      // Genuinely unresolvable, or offline: left out of the map, and the row
      // keeps rendering its raw id.
    }
  });
  return names;
}
