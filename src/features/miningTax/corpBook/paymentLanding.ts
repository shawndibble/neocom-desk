import { daySettleTolerance } from '@/engine/corpTaxBook/minerRunningAccount';
import type { RowHold } from '@/engine/corpTaxBook/personal';

/** One open day of the member's book (a `BookRowView` reduced to what a payment needs). */
export interface PayDay {
  id: string;
  /** EVE date mined: the oldest is paid first. */
  date: string;
  taxOwed: number;
  /** An open dispute holds the day: payments skip it. */
  held?: RowHold;
}

export type PayDayResult =
  | { result: 'paid' | 'next' }
  | { result: 'part'; partAmount: number }
  | { result: 'held'; held: RowHold };

export type PayDayLanding = PayDay & PayDayResult & { partAmount?: number; held?: RowHold };

export interface PaymentLanding {
  /** Every open day, oldest first. */
  days: PayDayLanding[];
  /** What is left once every payable day is covered: kept by the book as credit. */
  credit: number;
}

/**
 * Where a payment to a Corp Tax Book lands, mirroring the book's rule (`runningAccount.ts`):
 * oldest day first (date, then id); a day is paid when what is left covers it within
 * `daySettleTolerance` (a percent, no ISK floor); what is left after the last whole day part-pays the next one; a day an open dispute holds is
 * skipped and never paid. The member pays an amount and cannot pick a day.
 */
export function wherePaymentGoes(days: readonly PayDay[], amount: number): PaymentLanding {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let left = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const out = sorted.map((d): PayDayLanding => {
    if (d.held) return { ...d, result: 'held', held: d.held };
    if (left > 0 && left >= d.taxOwed - daySettleTolerance(d.taxOwed)) {
      left -= Math.min(left, d.taxOwed);
      return { ...d, result: 'paid' };
    }
    if (left > 0) {
      const partAmount = left;
      left = 0;
      return { ...d, result: 'part', partAmount };
    }
    return { ...d, result: 'next' };
  });
  return { days: out, credit: left };
}

/**
 * The rows a payment's default amount adds up: the days no dispute holds (payments skip a held
 * day, so ticking it would overpay). When every day is held there is nothing else to offer, so
 * they all stay.
 */
export function payableRows<T>(rows: readonly T[], heldOf: (row: T) => RowHold | undefined): T[] {
  const free = rows.filter((r) => !heldOf(r));
  return free.length > 0 ? free : [...rows];
}
