/**
 * A contract's `start_location_id`/`end_location_id` carry no `location_type`
 * the way an asset or clone row does (round 7/14 precedent), so there is
 * nothing to branch on up front. Both `loadStationName` and `loadStructureName`
 * already resolve a lookup failure to `null` rather than throwing (offline,
 * 404, ACL 403), so trying the station endpoint first and falling back to the
 * structure endpoint is a safe, cheap way to cover both id spaces without a
 * magic-number id-range heuristic.
 *
 * The *answer* is cached, not just the two lookups behind it. Those cache
 * their successes, but nothing caches the station probe's 404 — so for a
 * contract at a player structure (where the probe is always going to 404)
 * every open of the detail modal spent a fresh round trip re-learning that
 * this id is not a station. Caching the resolved name collapses a reopen to
 * one Dexie read and no request at all, for both id spaces.
 *
 * Per character, not under the global sentinel, because a structure name is
 * ACL-gated and `structures.ts` must not leak one to a character not on that
 * ACL. An unresolvable location (offline, or a structure this character can't
 * see into) caches nothing and is retried on the next open, which is the
 * honest outcome: `null` here means "don't know", never "has no name".
 */
import { loadWithCache, STALE_AFTER } from '@/esi/cache';
import { loadStationName } from './stations';
import { loadStructureName } from './structures';

function cacheKey(locationId: number): string {
  return `contract-location:${locationId}`;
}

export async function loadContractLocationName(
  characterId: number,
  locationId: number
): Promise<string | null> {
  const result = await loadWithCache(
    characterId,
    cacheKey(locationId),
    async () => {
      const stationName = await loadStationName(locationId);
      if (stationName) return stationName;
      return loadStructureName(characterId, locationId);
    },
    // A station or structure can be renamed, but rarely, and a contract is
    // short-lived next to that — the same trade `stations.ts` and
    // `structures.ts` already make for the lookups underneath.
    { staleAfterMs: STALE_AFTER.static }
  );
  return result?.data ?? null;
}
