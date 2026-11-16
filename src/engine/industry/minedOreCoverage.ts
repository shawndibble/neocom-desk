/**
 * "From ore you mine": which of the ores a pilot actually mined recently refine
 * into the minerals a Build Plan is short of (issue #6284). Read-only hint:
 * no units, volumes or prices. Pure — ledgers and reprocessing data arrive as inputs.
 */
import { shiftUtcDate } from '../localDay';

/** Ore type ids in every history's rows dated within the last `days` days up to `today` (UTC, inclusive). */
export function minedTypeIds(
  histories: readonly { rows: readonly { date: string; type_id: number }[] }[],
  today: string,
  days: number
): Set<number> {
  const cutoff = shiftUtcDate(today, -(days - 1));
  const ids = new Set<number>();
  for (const history of histories) {
    for (const row of history.rows) if (row.date >= cutoff) ids.add(row.type_id);
  }
  return ids;
}

export interface MinedOreCoverage {
  /** Short mineral type id -> mined ore type ids (ascending) that refine into it. */
  byMineral: Record<number, number[]>;
  /** Short minerals no mined ore yields. */
  buyThese: number[];
}

export function minedOreCoverage(input: {
  short: readonly number[];
  mined: ReadonlySet<number>;
  reprocessing: Readonly<Record<string, { materials: readonly { typeID: number }[] }>>;
}): MinedOreCoverage {
  const byMineral: Record<number, number[]> = {};
  const buyThese: number[] = [];
  const ores = [...input.mined].sort((a, b) => a - b);
  for (const mineral of input.short) {
    const yielding = ores.filter((ore) =>
      input.reprocessing[String(ore)]?.materials.some((m) => m.typeID === mineral)
    );
    if (yielding.length > 0) byMineral[mineral] = yielding;
    else buyThese.push(mineral);
  }
  return { byMineral, buyThese };
}
