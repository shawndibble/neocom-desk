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

/**
 * The whole snapshot as a lookup, or `null` if it could not be read.
 *
 * Exported, unlike `npcStations.ts`'s deliberately module-local equivalent,
 * because a pathfind reads a security status per system *inside* one pass and
 * awaiting each id would serialise the search. Prefer `lookupSolarSystem` for
 * one-off reads.
 */
export function loadSolarSystemsById(): Promise<ReadonlyMap<number, SolarSystemEntry> | null> {
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

let nameIndex: Promise<ReadonlyMap<string, SolarSystemEntry> | null> | null = null;

/**
 * The snapshot as a lookup by lower-cased system name, or `null` if it could
 * not be read. System names are unique, so this is the by-name twin of
 * `loadSolarSystemsById` for a caller that holds only a name (a typed Build
 * Plan system, a Shared Blueprint's system).
 */
export function loadSolarSystemsByName(): Promise<ReadonlyMap<string, SolarSystemEntry> | null> {
  nameIndex ??= loadSolarSystemsById().then((byId) => {
    if (!byId) {
      nameIndex = null;
      return null;
    }
    return new Map([...byId.values()].map((entry) => [entry.name.toLowerCase(), entry]));
  });
  return nameIndex;
}

/**
 * The snapshot's entry for a system name (case-insensitive), `null` if the
 * snapshot loaded and holds no such system, `undefined` if it could not be
 * read — the same three answers as `lookupSolarSystem`.
 */
export async function lookupSolarSystemByName(
  name: string
): Promise<SolarSystemEntry | null | undefined> {
  const byName = await loadSolarSystemsByName();
  if (!byName) return undefined;
  return byName.get(name.trim().toLowerCase()) ?? null;
}

/** Test-only: drops the memoized index so tests can swap the snapshot between cases. */
export function clearSolarSystemIndex(): void {
  index = null;
  nameIndex = null;
}
