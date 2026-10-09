/**
 * "Your share" of a Survey: how much of the field the viewer's own mining
 * ledger says they took. The ESI mining ledger is a row per day, system and
 * ore type, so this is a running total for the survey's day(s) in the chosen
 * system, not a per-scan figure; ore the viewer mined there that day before
 * the survey began counts too.
 */
export interface LedgerLine {
  /** EVE/UTC calendar date, e.g. "2026-10-08". */
  date: string;
  /** Ore units. */
  quantity: number;
  solar_system_id: number;
  type_id: number;
}

export interface OreType {
  name: string;
  /** m³ per unit. */
  volume: number;
}

export interface YourShareInput {
  rows: readonly LedgerLine[];
  systemId: number;
  /** First and last UTC date the survey's scans fall on, inclusive. */
  fromDate: string;
  toDate: string;
  types: ReadonlyMap<number, OreType>;
  /** The ore names the survey's scans show; only these count. */
  oreNames: ReadonlySet<string>;
  /** m³ the survey says has been mined, to take a share of. */
  surveyMined: number;
}

export interface YourShare {
  minedM3: number;
  /** Whole percent of what the survey shows mined, capped at 100; null when it shows none. */
  percentOfMined: number | null;
}

export function utcDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function yourShare(input: YourShareInput): YourShare {
  let minedM3 = 0;
  for (const row of input.rows) {
    if (row.solar_system_id !== input.systemId) continue;
    // ISO dates compare as strings.
    if (row.date < input.fromDate || row.date > input.toDate) continue;
    const type = input.types.get(row.type_id);
    if (type === undefined || !input.oreNames.has(type.name)) continue;
    minedM3 += row.quantity * type.volume;
  }
  const percentOfMined =
    input.surveyMined > 0 ? Math.min(100, Math.round((minedM3 / input.surveyMined) * 100)) : null;
  return { minedM3, percentOfMined };
}
