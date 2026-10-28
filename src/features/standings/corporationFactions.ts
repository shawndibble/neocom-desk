/**
 * Which faction an NPC corporation belongs to. ESI's corporation endpoint does
 * not say, so this reads the baked NPC-corporation file (every NPC corporation),
 * and falls back to the LP-store corporations and station owners only for a
 * corporation that file lacks. Callers only use `loadCorporationFactions`.
 */
import { loadLpCorporations, loadNpcStations } from '@/sde/loadMarketSde';
import { loadNpcCorporationsFile } from '@/sde/loadSde';
import type { LpCorporationEntry, NpcStationEntry } from '@/sde/marketTypes';
import type { NpcCorporationEntry } from '@/sde/types';

/** `npcCorporations` wins; the other two only add corporations it does not hold. */
export function corporationFactionMap(
  npcCorporations: readonly NpcCorporationEntry[],
  lpCorporations: readonly LpCorporationEntry[],
  stations: readonly NpcStationEntry[]
): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  for (const corporation of npcCorporations) {
    if (corporation.factionId !== undefined) map.set(corporation.id, corporation.factionId);
  }
  const addIfAbsent = (corporationId: number, factionId: number | undefined) => {
    if (factionId !== undefined && !map.has(corporationId)) map.set(corporationId, factionId);
  };
  for (const corporation of lpCorporations) addIfAbsent(corporation.id, corporation.factionId);
  for (const station of stations) {
    if (station.ownerCorporationId !== undefined) {
      addIfAbsent(station.ownerCorporationId, station.ownerFactionId);
    }
  }
  return map;
}

/**
 * Rejects when the NPC-corporation file cannot be read, so a view can show
 * "unavailable" rather than guess. The two snapshots behind the fallback are
 * optional: if one is unreadable the map is built without it.
 * (`loadNpcCorporations` indexes by id only; this needs the whole list.)
 */
export async function loadCorporationFactions(): Promise<ReadonlyMap<number, number>> {
  const [file, lpCorporations, stations] = await Promise.all([
    loadNpcCorporationsFile(),
    loadLpCorporations().catch(() => []),
    loadNpcStations().catch(() => []),
  ]);
  return corporationFactionMap(file.corporations, lpCorporations, stations);
}

export function corporationsOfFaction(
  corporationFactions: ReadonlyMap<number, number>,
  factionId: number
): number[] {
  return [...corporationFactions].filter(([, faction]) => faction === factionId).map(([id]) => id);
}
