/**
 * The Balance tab's Cash flow: ISK earned and spent over the last 7, 30 or 90
 * UTC days, from the wallet journal. Pure: journal rows in, figures out. Same
 * rules as the Journal's daily flow (own-Character transfers left out).
 */
import { journalDailyFlow, type JournalDayFlow } from '../journalDailyFlow';
import type { JournalRow } from '../journalNetting';
import { parseInstant } from '../esiInstant';
import { shiftUtcDate, utcDay } from '../localDay';

export type CashFlowDays = 7 | 30 | 90;

export interface CashFlow {
  earned: number;
  spent: number;
  net: number;
  /** Earned per day over the window. */
  perDay: number;
  /** One entry per day of the window, oldest first. */
  days: JournalDayFlow[];
  /** Earned in the window just before this one; null when the history does not reach back that far. */
  earnedBefore: number | null;
  /** The oldest journal day held, or null with no lines. */
  coveredFrom: string | null;
  /** The history starts inside the window, so the figures undercount. */
  partial: boolean;
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

  let coveredFrom: string | null = null;
  for (const row of rows) {
    const at = parseInstant(row.date);
    if (at === null) continue;
    const day = utcDay(at);
    if (coveredFrom === null || day < coveredFrom) coveredFrom = day;
  }

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
