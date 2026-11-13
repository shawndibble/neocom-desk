import type { MinerRow } from './bookView';

/**
 * Overdue debt by age, as a collections list reads it (Stripe Billing's invoice age):
 * 0–30, 31–60, 61–90 and over 90 days past due. A Miner counts once, in the bucket of its
 * oldest overdue Statement (`MinerRow.overdueDays`), with its whole debt, so the buckets
 * add up to the Overdue total.
 */
export const OVERDUE_AGE_BUCKETS = ['0-30', '31-60', '61-90', 'over-90'] as const;
export type OverdueAgeBucket = (typeof OVERDUE_AGE_BUCKETS)[number];

export interface OverdueAgeRow {
  id: OverdueAgeBucket;
  /** Miners in the bucket. */
  count: number;
  /** What those Miners owe. */
  amount: number;
}

type AgedMiner = Pick<MinerRow, 'owed' | 'overdueDays' | 'credit'>;

export function overdueAgeBucketOf(days: number): OverdueAgeBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return 'over-90';
}

/** Every bucket, in age order; an empty one stays at zero so the list never reshapes. */
export function overdueAging(miners: readonly AgedMiner[]): OverdueAgeRow[] {
  const rows = OVERDUE_AGE_BUCKETS.map((id) => ({ id, count: 0, amount: 0 }));
  for (const m of miners) {
    if (m.overdueDays === null) continue;
    const row = rows[OVERDUE_AGE_BUCKETS.indexOf(overdueAgeBucketOf(m.overdueDays))];
    row.count++;
    row.amount += m.owed;
  }
  return rows;
}

/** The Miners tab's Balance filter (`?balance=`): who owes, who is overdue (by age), who holds credit. */
export const MINER_BALANCES = [
  'owing',
  'overdue',
  ...OVERDUE_AGE_BUCKETS.map((b) => `overdue-${b}` as const),
  'credit',
] as const;
export type MinerBalance = (typeof MINER_BALANCES)[number];

export function matchesMinerBalance(m: AgedMiner, balance: MinerBalance): boolean {
  switch (balance) {
    case 'owing':
      return m.owed > 0;
    case 'overdue':
      return m.overdueDays !== null;
    // A sub-ISK remainder is no credit, as the Credit column shows it.
    case 'credit':
      return Math.round(m.credit) > 0;
    default:
      return m.overdueDays !== null && `overdue-${overdueAgeBucketOf(m.overdueDays)}` === balance;
  }
}
