import { loadNpcStations } from './loadMarketSde';
import type { NpcStationEntry } from './marketTypes';
import { memoizeAsync } from '@/lib/memoizeAsync';

const loadNpcStationsById = memoizeAsync(
  async (): Promise<ReadonlyMap<number, NpcStationEntry>> => {
    const map = new Map<number, NpcStationEntry>();
    for (const entry of await loadNpcStations()) map.set(entry.id, entry);
    return map;
  },
  { fallback: null }
);

export async function lookupNpcStation(
  stationId: number
): Promise<NpcStationEntry | null | undefined> {
  const byId = await loadNpcStationsById();
  if (!byId) return undefined;
  return byId.get(stationId) ?? null;
}

const DEFAULT_REPROCESSING_TAKE = 0.05;

export function stationReprocessingTake(station: NpcStationEntry): number {
  return station.reprocessingStationsTake ?? DEFAULT_REPROCESSING_TAKE;
}

export function clearNpcStationIndex(): void {
  loadNpcStationsById.reset();
}
