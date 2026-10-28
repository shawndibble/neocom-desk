/**
 * Which station of an NPC corporation is nearest the pilot (issue #5384).
 * Pure over the NPC station list and the jumps from the Current System, the
 * same `jumps` map `nearestStation` in `itemSearch.ts` takes.
 */
import type { NpcStationEntry } from '@/sde/marketTypes';

export interface NearestNpcStation {
  stationId: number;
  stationName: string;
  systemId: number;
  jumps: number;
}

/**
 * The corporation's station with the fewest jumps; ties go to the lowest
 * station id. Null when distances are not known, no station is reachable, or
 * the snapshot has no `ownerCorporationId` (owner unknown).
 */
export function nearestNpcStation(
  corporationId: number,
  stations: readonly NpcStationEntry[],
  jumps: ReadonlyMap<number, number> | null
): NearestNpcStation | null {
  if (jumps === null) return null;
  let best: NearestNpcStation | null = null;
  for (const station of stations) {
    if (station.ownerCorporationId !== corporationId) continue;
    const count = jumps.get(station.systemId);
    if (count === undefined) continue;
    if (
      best === null ||
      count < best.jumps ||
      (count === best.jumps && station.id < best.stationId)
    ) {
      best = {
        stationId: station.id,
        stationName: station.name,
        systemId: station.systemId,
        jumps: count,
      };
    }
  }
  return best;
}
