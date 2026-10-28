/**
 * Which faction an NPC corporation belongs to. ESI's corporation endpoint does
 * not say, so this reads the shipped snapshots: the LP-store corporations and
 * the station owners. A corporation in neither (no station, no store) is not
 * known. This is the one lookup to swap when a fuller NPC-corporation file is
 * baked; callers only use `loadCorporationFactions`.
 */
import { loadLpCorporations, loadNpcStations } from '@/sde/loadMarketSde';
import type { LpCorporationEntry, NpcStationEntry } from '@/sde/marketTypes';

export function corporationFactionMap(
  lpCorporations: readonly LpCorporationEntry[],
  stations: readonly NpcStationEntry[]
): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  for (const corporation of lpCorporations) {
    if (corporation.factionId !== undefined) map.set(corporation.id, corporation.factionId);
  }
  for (const station of stations) {
    if (station.ownerCorporationId !== undefined && station.ownerFactionId !== undefined) {
      map.set(station.ownerCorporationId, station.ownerFactionId);
    }
  }
  return map;
}

/** Rejects when a snapshot cannot be read, so a view can show "unavailable" rather than guess. */
export async function loadCorporationFactions(): Promise<ReadonlyMap<number, number>> {
  const [lpCorporations, stations] = await Promise.all([loadLpCorporations(), loadNpcStations()]);
  return corporationFactionMap(lpCorporations, stations);
}

export function corporationsOfFaction(
  corporationFactions: ReadonlyMap<number, number>,
  factionId: number
): number[] {
  return [...corporationFactions].filter(([, faction]) => faction === factionId).map(([id]) => id);
}
