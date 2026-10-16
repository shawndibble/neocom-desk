import type { JournalRow } from './journalNetting';

/** One EVE (UTC) day of the Journal: ISK in and out, both as non-negative sums. */
export interface JournalDayFlow {
  /** `YYYY-MM-DD`, the UTC day. */
  day: string;
  in: number;
  out: number;
  net: number;
}

const DAY_MS = 86_400_000;

/**
 * Daily In / Out for the "Where the ISK went" chart (#3914). Same rules as the
 * panel's totals: own-Character transfers are left out and a missing `amount`
 * counts as zero. Days with no lines between the first and last are kept as
 * zero rows so the bars sit on an even time axis.
 */
export function journalDailyFlow(rows: readonly JournalRow[]): JournalDayFlow[] {
  const byDay = new Map<string, JournalDayFlow>();
  for (const entry of rows) {
    if (entry.internal) continue;
    const day = entry.date.slice(0, 10);
    const amount = entry.amount ?? 0;
    const flow = byDay.get(day) ?? { day, in: 0, out: 0, net: 0 };
    if (amount > 0) flow.in += amount;
    else flow.out -= amount;
    flow.net += amount;
    byDay.set(day, flow);
  }
  if (byDay.size === 0) return [];
  const keys = [...byDay.keys()].sort();
  const result: JournalDayFlow[] = [];
  const end = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`);
  for (let time = Date.parse(`${keys[0]}T00:00:00Z`); time <= end; time += DAY_MS) {
    const day = new Date(time).toISOString().slice(0, 10);
    result.push(byDay.get(day) ?? { day, in: 0, out: 0, net: 0 });
  }
  return result;
}
