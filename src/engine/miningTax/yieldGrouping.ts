import type { MiningLedgerRow, OreLine } from './types';

/**
 * One derived Mining Yield entry (issue #671): every ore/ice row ESI reports
 * for one (character, EVE/UTC date, solar system), summed per ore type —
 * unlike `MiningLedgerEntry`, this is not filtered to moon ore, and it is
 * deliberately its own type rather than a reuse of that one: `MiningLedgerEntry`
 * (and `Assignment`/`Payee`) are glossary-bound to the rent/tax feature's very
 * different meaning (CONTEXT.md), and a plain output-stats row is a different
 * concept even though the two happen to share a shape today.
 */
export interface MiningYieldEntry {
  characterId: number;
  /** EVE/UTC calendar date, e.g. "2026-09-04". */
  date: string;
  solarSystemId: number;
  /** Sorted by typeId ascending. */
  oreLines: OreLine[];
}

interface EntryGroup {
  date: string;
  solarSystemId: number;
  lines: Map<number, number>;
}

/**
 * Groups a character's raw ESI mining ledger rows into one Mining Yield entry
 * per (date, solar system), summing quantity per ore type and keeping
 * anything on `oreAndIceTypeIds` — moon ore included, since a pilot's total
 * mining output is the point here, not just the ore that is someone else's
 * rent. See `groupMiningLedger` (`./groupLedger.ts`) for the moon-ore-only
 * variant the Tax tab still uses; the two are intentionally separate modules.
 *
 * `row.date` is carried through byte-for-byte as the grouping key — never
 * routed through a `Date`/`toLocaleDateString` — so the EVE/UTC calendar day
 * cannot drift with the browser's local timezone.
 */
export function groupMiningYield(
  rows: readonly MiningLedgerRow[],
  characterId: number,
  oreAndIceTypeIds: ReadonlySet<number>
): MiningYieldEntry[] {
  const byKey = new Map<string, EntryGroup>();

  for (const row of rows) {
    if (!oreAndIceTypeIds.has(row.type_id)) continue;
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
