import type { BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { nearestNpcStation } from '@/features/loyalty/nearestNpcStation';
import type { NpcStationEntry } from '@/sde/marketTypes';

export function placeLpRows(
  rows: readonly BpcSearchRow[],
  stations: readonly NpcStationEntry[] | null,
  jumps: ReadonlyMap<number, number> | null
): readonly BpcSearchRow[] {
  if (!stations || !jumps) return rows;
  const byCorp = new Map<number, ReturnType<typeof nearestNpcStation>>();
  return rows.map((row) => {
    if (row.source !== 'lp') return row;
    if (!byCorp.has(row.corporationId)) {
      byCorp.set(row.corporationId, nearestNpcStation(row.corporationId, stations, jumps));
    }
    const station = byCorp.get(row.corporationId);
    return station ? { ...row, systemId: station.systemId, stationName: station.stationName } : row;
  });
}
