import type { NpcStationEntry } from '@/sde/marketTypes';

export interface NearestNpcStation {
  stationId: number;
  stationName: string;
  systemId: number;
  jumps: number;
}

export function nearestStationWhere(
  stations: readonly NpcStationEntry[],
  jumps: ReadonlyMap<number, number> | null,
  owns: (station: NpcStationEntry) => boolean
): NearestNpcStation | null {
  if (jumps === null) return null;
  let best: NearestNpcStation | null = null;
  for (const station of stations) {
    if (!owns(station)) continue;
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

export function nearestNpcStation(
  corporationId: number,
  stations: readonly NpcStationEntry[],
  jumps: ReadonlyMap<number, number> | null
): NearestNpcStation | null {
  return nearestStationWhere(
    stations,
    jumps,
    (station) => station.ownerCorporationId === corporationId
  );
}
