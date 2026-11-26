import type { MinerRow } from './bookView';

export const OVERDUE_AGE_BUCKETS = ['0-30', '31-60', '61-90', 'over-90'] as const;
export type OverdueAgeBucket = (typeof OVERDUE_AGE_BUCKETS)[number];

export interface OverdueAgeRow {
  id: OverdueAgeBucket;
  count: number;
  amount: number;
}

type AgedMiner = Pick<MinerRow, 'owed' | 'overdueDays' | 'credit'>;

export function overdueAgeBucketOf(days: number): OverdueAgeBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return 'over-90';
}

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

export const MINER_BALANCES = [
  'owing',
  'overdue',
  ...OVERDUE_AGE_BUCKETS.map((b) => balanceOfBucket(b)),
  'credit',
] as const;
export type MinerBalance = 'owing' | 'overdue' | `overdue-${OverdueAgeBucket}` | 'credit';

export function balanceOfBucket(bucket: OverdueAgeBucket): `overdue-${OverdueAgeBucket}` {
  return `overdue-${bucket}`;
}

export function matchesMinerBalance(m: AgedMiner, balance: MinerBalance): boolean {
  switch (balance) {
    case 'owing':
      return m.owed > 0;
    case 'overdue':
      return m.overdueDays !== null;
    case 'credit':
      return Math.round(m.credit) > 0;
    case 'overdue-0-30':
    case 'overdue-31-60':
    case 'overdue-61-90':
    case 'overdue-over-90':
      return (
        m.overdueDays !== null && balanceOfBucket(overdueAgeBucketOf(m.overdueDays)) === balance
      );
  }
}
