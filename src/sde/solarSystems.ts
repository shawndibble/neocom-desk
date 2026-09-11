/**
 * `public/data/market/systems.json` read as a lookup by system id — the
 * `npcStations.ts` pattern, applied to the solar-system table instead of the
 * station one. Every system in the game, including wormholes, with its name,
 * raw security status, and region id: exactly what BPC Search's Space
 * classification (issue #796) needs, and none of it costs an ESI request
 * once this file has loaded.
 *
 * Indexed once per session for the same reason `npcStations.ts` is: ~8,500
 * entries scanned per lookup would be O(ids × 8,500) for a table resolving a
 * distinct system per row.
 */
import { loadSolarSystems } from './loadMarketSde';
import type { SolarSystemEntry } from './marketTypes';

let index: Promise<ReadonlyMap<number, SolarSystemEntry> | null> | null = null;

function loadSolarSystemsById(): Promise<ReadonlyMap<number, SolarSystemEntry> | null> {
  index ??= loadSolarSystems()
    .then((entries): ReadonlyMap<number, SolarSystemEntry> => {
      const map = new Map<number, SolarSystemEntry>();
      for (const entry of entries) map.set(entry.id, entry);
      return map;
    })
    .catch(() => {
      index = null;
      return null;
    });
  return index;
}

/**
 * The snapshot's entry for one system id, or `null` if the snapshot loaded
 * and holds no such id (should not happen — every system is in it), or
 * `undefined` if the snapshot itself could not be read (offline first visit;
 * this file sits outside the install precache, same as `stations.json`).
 */
export async function lookupSolarSystem(
  systemId: number
): Promise<SolarSystemEntry | null | undefined> {
  const byId = await loadSolarSystemsById();
  if (!byId) return undefined;
  return byId.get(systemId) ?? null;
}

/** Test-only: drops the memoized index so tests can swap the snapshot between cases. */
export function clearSolarSystemIndex(): void {
  index = null;
}
