import type { MiningLedgerRow, OreLine } from './types';

export interface MiningYieldEntry {
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: OreLine[];
}

interface EntryGroup {
  date: string;
  solarSystemId: number;
  lines: Map<number, number>;
}

export function groupMiningYield(
  rows: readonly MiningLedgerRow[],
  characterId: number,
  harvestedTypeIds: ReadonlySet<number>
): MiningYieldEntry[] {
  const byKey = new Map<string, EntryGroup>();

  for (const row of rows) {
    if (!harvestedTypeIds.has(row.type_id)) continue;
    const key = `${row.date}:${row.solar_system_id}`;
    let group = byKey.get(key);
    if (!group) {
      group = { date: row.date, solarSystemId: row.solar_system_id, lines: new Map() };
      byKey.set(key, group);
    }
    group.lines.set(row.type_id, (group.lines.get(row.type_id) ?? 0) + row.quantity);
  }

  return [...byKey.values()]
    .map((group): MiningYieldEntry => ({
      characterId,
      date: group.date,
      solarSystemId: group.solarSystemId,
      oreLines: [...group.lines.entries()]
        .map(([typeId, quantity]): OreLine => ({ typeId, quantity }))
        .sort((a, b) => a.typeId - b.typeId),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.solarSystemId - b.solarSystemId);
}
