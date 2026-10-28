/**
 * Places LP Store rows on the map (issue #5387): an LP offer has only its
 * corporation, so each row takes the corporation's nearest station — its
 * system feeds Jump Range, the Jumps column and the route link.
 */
import type { BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { nearestNpcStation } from '@/features/loyalty/nearestNpcStation';
import type { NpcStationEntry } from '@/sde/marketTypes';

/** Rows other than LP pass through; an LP row with no reachable station stays unplaced. */
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
