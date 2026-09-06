import type { MiningLedgerEntry, MiningLedgerRow, OreLine } from './types';

interface EntryGroup {
  date: string;
  solarSystemId: number;
  lines: Map<number, number>;
}

/**
 * Groups a character's raw ESI mining ledger rows into one Mining Ledger
 * Entry per (date, solar system), summing quantity per ore type and dropping
 * anything outside `moonOreTypeIds` — ordinary asteroid ore and ice already
 * arrive under different `type_id`s, so this is the whole of what isolates
 * moon mining (decision doc: zero interruption-detection logic needed).
 *
 * `row.date` is carried through byte-for-byte as the grouping key — never
 * routed through a `Date`/`toLocaleDateString` — so the EVE/UTC calendar day
 * cannot drift with the browser's local timezone.
 */
export function groupMiningLedger(
  rows: readonly MiningLedgerRow[],
  characterId: number,
  moonOreTypeIds: ReadonlySet<number>
): MiningLedgerEntry[] {
  const byKey = new Map<string, EntryGroup>();

  for (const row of rows) {
    if (!moonOreTypeIds.has(row.type_id)) continue;
    const key = `${row.date}:${row.solar_system_id}`;
    let group = byKey.get(key);
    if (!group) {
      group = { date: row.date, solarSystemId: row.solar_system_id, lines: new Map() };
      byKey.set(key, group);
    }
    group.lines.set(row.type_id, (group.lines.get(row.type_id) ?? 0) + row.quantity);
  }

  return [...byKey.values()]
    .map((group): MiningLedgerEntry => ({
      characterId,
      date: group.date,
      solarSystemId: group.solarSystemId,
      oreLines: [...group.lines.entries()]
        .map(([typeId, quantity]): OreLine => ({ typeId, quantity }))
        .sort((a, b) => a.typeId - b.typeId),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.solarSystemId - b.solarSystemId);
}
