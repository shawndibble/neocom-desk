import { utcDay } from './netWorth/snapshot';
import type { JournalRow } from './journalNetting';
import { parseInstant } from './esiInstant';
import { DAY_MS } from '@/lib/age';

/** One EVE (UTC) day of the Journal: ISK in and out, both as non-negative sums. */
export interface JournalDayFlow {
  /** `YYYY-MM-DD`, the UTC day. */
  day: string;
  in: number;
  out: number;
  net: number;
}

/** Days drawn when the Journal has no date range. */
export const FLOW_DEFAULT_DAYS = 30;
/** Most days drawn: past this the bars shrink below a pixel. */
export const FLOW_MAX_DAYS = 92;

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const shiftDay = (day: string, by: number) => utcDay(dayMs(day) + by * DAY_MS);

export interface JournalFlowWindow {
  from: string;
  to: string;
  /** The filter's range was longer than `FLOW_MAX_DAYS`, so only its last days are drawn. */
  truncated: boolean;
}

/**
 * The days the chart draws. Axis bounds come from the date filter, not from the
 * rows, so empty edge days still show. A one-day filter keeps the default
 * window (shifted only to include that day) so the bars don't collapse to one.
 */
export function journalFlowWindow(
  startDate: string | null,
  endDate: string | null,
  today: string
): JournalFlowWindow {
  const singleDay = startDate !== null && startDate === endDate;
  if (singleDay || (startDate === null && endDate === null)) {
    let to = today;
    if (singleDay && shiftDay(today, -(FLOW_DEFAULT_DAYS - 1)) > startDate) {
      to = shiftDay(startDate, FLOW_DEFAULT_DAYS - 2);
      if (to > today) to = today;
    }
    return { from: shiftDay(to, -(FLOW_DEFAULT_DAYS - 1)), to, truncated: false };
  }
  const to = endDate ?? today;
  const from = startDate ?? shiftDay(to, -(FLOW_DEFAULT_DAYS - 1));
  if (from > to) return { from: to, to, truncated: false };
  const floor = shiftDay(to, -(FLOW_MAX_DAYS - 1));
  return from < floor ? { from: floor, to, truncated: true } : { from, to, truncated: false };
}

/**
 * Daily In / Out for the "Where the ISK went" chart (#3914). Same rules as the
 * panel's totals: own-Character transfers are left out and a missing `amount`
 * counts as zero. Every day of `window` gets a row (zeros when empty) so the
 * bars sit on an even time axis; without a window, the first to last line's day.
 */
export function journalDailyFlow(
  rows: readonly JournalRow[],
  window?: { from: string; to: string }
): JournalDayFlow[] {
  const byDay = new Map<string, JournalDayFlow>();
  for (const entry of rows) {
    if (entry.internal) continue;
    const at = parseInstant(entry.date);
    if (at === null) continue;
    const day = utcDay(at);
    const amount = entry.amount ?? 0;
    const flow = byDay.get(day) ?? { day, in: 0, out: 0, net: 0 };
    if (amount > 0) flow.in += amount;
    else flow.out -= amount;
    flow.net += amount;
    byDay.set(day, flow);
  }
  const keys = [...byDay.keys()].sort();
  const from = window?.from ?? keys[0];
  const to = window?.to ?? keys[keys.length - 1];
  if (from === undefined || to === undefined) return [];
  const result: JournalDayFlow[] = [];
  for (let time = dayMs(from); time <= dayMs(to); time += DAY_MS) {
    const day = utcDay(time);
    result.push(byDay.get(day) ?? { day, in: 0, out: 0, net: 0 });
  }
  return result;
}
