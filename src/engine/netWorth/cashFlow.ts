import { journalDailyFlow, type JournalDayFlow } from '../journalDailyFlow';
import type { JournalRow } from '../journalNetting';
import { parseInstant } from '../esiInstant';
import { shiftUtcDate, utcDay } from '../localDay';

export type CashFlowDays = 7 | 30 | 90;

export interface CashFlow {
  earned: number;
  spent: number;
  net: number;
  perDay: number;
  days: JournalDayFlow[];
  earnedBefore: number | null;
  coveredFrom: string | null;
  partial: boolean;
}

function coveredFromAll(rows: readonly JournalRow[]): string | null {
  const oldest = new Map<number | undefined, string>();
  for (const row of rows) {
    const at = parseInstant(row.date);
    if (at === null) continue;
    const day = utcDay(at);
    const held = oldest.get(row.characterId);
    if (held === undefined || day < held) oldest.set(row.characterId, day);
  }
  let newest: string | null = null;
  for (const day of oldest.values()) if (newest === null || day > newest) newest = day;
  return newest;
}

export function cashFlow(
  rows: readonly JournalRow[],
  length: CashFlowDays,
  today: string
): CashFlow {
  const from = shiftUtcDate(today, -(length - 1));
  const days = journalDailyFlow(rows, { from, to: today });
  const earned = days.reduce((sum, day) => sum + day.in, 0);
  const spent = days.reduce((sum, day) => sum + day.out, 0);

  const coveredFrom = coveredFromAll(rows);

  const beforeFrom = shiftUtcDate(from, -length);
  const earnedBefore =
    coveredFrom !== null && coveredFrom <= beforeFrom
      ? journalDailyFlow(rows, { from: beforeFrom, to: shiftUtcDate(from, -1) }).reduce(
          (sum, day) => sum + day.in,
          0
        )
      : null;

  return {
    earned,
    spent,
    net: earned - spent,
    perDay: earned / length,
    days,
    earnedBefore,
    coveredFrom,
    partial: coveredFrom !== null && coveredFrom > from,
  };
}
