/**
 * NPC station lookups for Assets grouping, Clones, owned-stock detection and
 * the Build Location search.
 *
 * The SDE snapshot answers first (`sde/npcStations.ts`). `stations.json` is
 * the whole `staStations` table, so for every id ESI has already labelled a
 * station — an asset row's `location_type`, a clone's, a detected placement's —
 * the name, system and type come back with no request at all, and the
 * `Promise.all(stationIds.map(...))` fan-outs at those call sites stop being
 * network fan-outs rather than needing a concurrency cap (issue #655).
 *
 * `GET /universe/stations/{id}` stays as the fallback for the two cases the
 * snapshot cannot answer: an id it does not hold (a station CCP added since
 * the last `npm run sde:build` — rare, and this is what stops a stale snapshot
 * from losing a name outright), and a snapshot that could not be read at all.
 * It is public and cacheable (see cache.ts), which is also what keeps station
 * names working offline once seen, since `stations.json` itself is outside the
 * install precache.
 *
 * A caller holding an id whose *kind* is not known up front wants
 * `lookupNpcStation` directly instead of these: there, a snapshot miss is the
 * answer ("that is a player structure"), not a reason to ask ESI.
 * `contractLocationName.ts` is the one that does.
 *
 * Player structures are a different endpoint with a different auth shape
 * (ACL-checked, not merely scope-gated) — see `structures.ts`'s
 * `loadStructureName`.
 */
import { getUniverseStation, type UniverseStation } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';
import { lookupNpcStation } from '@/sde/npcStations';

function cacheKey(stationId: number): string {
  return `station:${stationId}`;
}

async function loadStation(stationId: number): Promise<UniverseStation | null> {
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(stationId),
    async () => (await getUniverseStation(stationId)).data,
    // An NPC station's name and system do not change.
    { staleAfterMs: STALE_AFTER.static }
  );
  return result?.data ?? null;
}

/** Station name for a stationId, or null if unresolvable (offline + uncached). */
export async function loadStationName(stationId: number): Promise<string | null> {
  const snapshot = await lookupNpcStation(stationId);
  if (snapshot) return snapshot.name;
  return (await loadStation(stationId))?.name ?? null;
}

/** Station's solar system id, for jumps-away distances (issue #87), or null if unresolvable. */
export async function loadStationSystemId(stationId: number): Promise<number | null> {
  const snapshot = await lookupNpcStation(stationId);
  if (snapshot) return snapshot.systemId;
  return (await loadStation(stationId))?.system_id ?? null;
}

/**
 * The same three fields `loadStructureSummary` returns, for an NPC station.
 *
 * The only one of these that needs the snapshot's `typeId`, and so the only
 * one that still reaches ESI against a snapshot built before issue #655 added
 * the field — a summary missing its type id is not a summary, and inventing
 * one would pick a facility preset out of thin air.
 */
export async function loadStationSummary(
  stationId: number
): Promise<{ name: string; systemId: number; typeId: number } | null> {
  const snapshot = await lookupNpcStation(stationId);
  if (snapshot?.typeId !== undefined) {
    return { name: snapshot.name, systemId: snapshot.systemId, typeId: snapshot.typeId };
  }
  const station = await loadStation(stationId);
  return station
    ? { name: station.name, systemId: station.system_id, typeId: station.type_id }
    : null;
}
