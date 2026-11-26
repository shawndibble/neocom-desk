import { utcDay } from './netWorth/snapshot';
import type { JournalRow } from './journalNetting';
import { parseInstant } from './esiInstant';
import { DAY_MS } from '@/lib/age';
import { shiftUtcDate } from './localDay';

export interface JournalDayFlow {
  day: string;
  in: number;
  out: number;
  net: number;
}

export const FLOW_DEFAULT_DAYS = 30;
export const FLOW_MAX_DAYS = 92;

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

export interface JournalFlowWindow {
  from: string;
  to: string;
  truncated: boolean;
}

export function journalFlowWindow(
  startDate: string | null,
  endDate: string | null,
  today: string
): JournalFlowWindow {
  const singleDay = startDate !== null && startDate === endDate;
  if (singleDay || (startDate === null && endDate === null)) {
    let to = today;
    if (singleDay && shiftUtcDate(today, -(FLOW_DEFAULT_DAYS - 1)) > startDate) {
      to = shiftUtcDate(startDate, FLOW_DEFAULT_DAYS - 2);
      if (to > today) to = today;
    }
    return { from: shiftUtcDate(to, -(FLOW_DEFAULT_DAYS - 1)), to, truncated: false };
  }
  const to = endDate ?? today;
  const from = startDate ?? shiftUtcDate(to, -(FLOW_DEFAULT_DAYS - 1));
  if (from > to) return { from: to, to, truncated: false };
  const floor = shiftUtcDate(to, -(FLOW_MAX_DAYS - 1));
  return from < floor ? { from: floor, to, truncated: true } : { from, to, truncated: false };
}

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
