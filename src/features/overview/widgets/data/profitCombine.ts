import { DAY_MS } from '@/lib/age';
import { backwardBucketSums } from './chartSeries';

export type ProfitOrigin = 'builds' | 'trading';

export interface ProfitPoint {
  at: number;
  profit: number;
}

export interface ProfitRow {
  key: string;
  name: string;
  profit: number | null;
}

export interface SourceProfit {
  total: number;
  previous: number | null;
  points: readonly ProfitPoint[];
  rows: readonly ProfitRow[];
}

export interface ProfitBuckets {
  daily: boolean;
  bucketMs: number;
  buckets: number;
}

export interface CombinedProfit {
  total: number;
  totals: Record<ProfitOrigin, number>;
  delta: number | null;
  buckets: ProfitBuckets;
  series: { builds: number[]; trading: number[]; total: number[] };
  rows: (ProfitRow & { source: ProfitOrigin })[];
}

export function profitBuckets(range: number): ProfitBuckets {
  const daily = range <= 7;
  return {
    daily,
    bucketMs: daily ? DAY_MS : 7 * DAY_MS,
    buckets: daily ? range : Math.ceil(range / 7),
  };
}

export function combineProfit(
  builds: SourceProfit,
  trading: SourceProfit | null,
  now: number,
  range: number
): CombinedProfit {
  const buckets = profitBuckets(range);
  const sums = (points: readonly ProfitPoint[]) =>
    backwardBucketSums(
      points,
      (p) => p.at,
      (p) => p.profit,
      now,
      buckets.bucketMs,
      buckets.buckets
    );
  const b = sums(builds.points);
  const tr = sums(trading?.points ?? []);
  const totals = { builds: builds.total, trading: trading?.total ?? 0 };
  const total = totals.builds + totals.trading;
  const read = trading === null ? [builds] : [builds, trading];
  const delta = read.some((s) => s.previous !== null)
    ? total - read.reduce((sum, s) => sum + (s.previous ?? 0), 0)
    : null;
  const rows = [
    ...builds.rows.map((row) => ({ ...row, source: 'builds' as const })),
    ...(trading?.rows ?? []).map((row) => ({ ...row, source: 'trading' as const })),
  ].sort((x, y) => {
    if (x.profit === null || y.profit === null) {
      return x.profit === y.profit ? 0 : x.profit === null ? 1 : -1;
    }
    return y.profit - x.profit;
  });
  return {
    total,
    totals,
    delta,
    buckets,
    series: { builds: b, trading: tr, total: b.map((v, i) => v + tr[i]!) },
    rows,
  };
}
