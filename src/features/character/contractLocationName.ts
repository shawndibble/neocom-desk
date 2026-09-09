/**
 * A contract's `start_location_id`/`end_location_id` carry no `location_type`
 * the way an asset or clone row does (round 7/14 precedent), so there is
 * nothing in the response to branch on up front. This used to probe the
 * station endpoint and fall back to the structure one — and nothing caches the
 * probe's 404, so a contract at a player structure (where it was always going
 * to 404) spent a fresh round trip on every open re-learning that this id is
 * not a station, against the same 100-errors-per-minute ESI budget everything
 * else shares.
 *
 * The SDE snapshot removes that probe (issue #655). `stations.json` is the
 * complete `staStations` table, so membership in it *is* the missing
 * `location_type`: an id it holds is an NPC station, named on the spot with no
 * request; an id it has loaded and does not hold is a player structure, so the
 * lookup goes straight to `/universe/structures/{id}`. No magic-number id
 * range is involved — the discriminator is the table itself.
 *
 * When the snapshot cannot be read at all (a first offline visit — it is
 * outside the install precache on purpose, CONTEXT.md round 10)
 * `lookupNpcStation` says so rather than answering "not a station", and this
 * falls back to the original station-then-structure probe. Both
 * `loadStationName` and `loadStructureName` resolve a lookup failure to `null`
 * rather than throwing (offline, 404, ACL 403), which is what makes trying
 * both safe.
 *
 * The *answer* is cached, not just the lookups behind it, so a reopen collapses
 * to one Dexie read for both id spaces. Per character, not under the global
 * sentinel: `structures.ts` already shares a resolved structure name across
 * this browser's own roster on its own row (issue #669), so duplicating that
 * sharing here would only be a second cache of the same fact under a
 * different key. An unresolvable location (offline, or a structure nobody in
 * the roster can see into) caches nothing and is retried on the next open,
 * which is the honest outcome: `null` here means "don't know", never "has no
 * name".
 */
import { loadWithCache, STALE_AFTER } from '@/esi/cache';
import { lookupNpcStation } from '@/sde/npcStations';
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
      const snapshot = await lookupNpcStation(locationId);
      if (snapshot) return snapshot.name;
      // Loaded, and this id is not in it: a player structure, definitively.
      if (snapshot === null) return loadStructureName(characterId, locationId);
      // No snapshot to decide with — the pre-#655 probe order.
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
