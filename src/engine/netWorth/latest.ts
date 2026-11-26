import { LAYER_IDS, layerValues, netWorthOf, type LayerValues } from './series';
import type { NetWorthSnapshotRow } from './snapshot';

export interface LatestNetWorth {
  day: string;
  layers: LayerValues;
  total: number;
}

export function latestNetWorthByCharacter(
  rows: readonly NetWorthSnapshotRow[]
): Map<number, LatestNetWorth> {
  const newest = new Map<number, NetWorthSnapshotRow>();
  for (const row of rows) {
    const seen = newest.get(row.characterId);
    if (!seen || row.day > seen.day) newest.set(row.characterId, row);
  }
  const result = new Map<number, LatestNetWorth>();
  for (const [characterId, row] of newest) {
    const layers = layerValues(row);
    result.set(characterId, { day: row.day, layers, total: netWorthOf(layers, LAYER_IDS) });
  }
  return result;
}
