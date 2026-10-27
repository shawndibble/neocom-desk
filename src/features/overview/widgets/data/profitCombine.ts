/**
 * The Profit widget's Both source (decision `20261024-191335`):
 * logged builds and market trades added up over one window. Pure: the builder
 * hands each source's figures in already priced, and this only sums them on
 * shared periods.
 */
import { DAY_MS } from '@/lib/age';
import { backwardBucketSums } from './chartSeries';

/** Where a figure came from. */
export type ProfitOrigin = 'builds' | 'trading';

/** One priced event: a logged run, or a matched sale. */
export interface ProfitPoint {
  at: number;
  profit: number;
}

/** One table line: a product for builds, an item for trades; `null` is a margin that could not be priced. */
export interface ProfitRow {
  key: string;
  name: string;
  profit: number | null;
}

/** What one source made, as its own builder already reckons it. */
export interface SourceProfit {
  /** The window's total. */
  total: number;
  /** The window before's total, or null when the source has nothing there to compare with. */
  previous: number | null;
  /** Every priced event held; the periods pick their own. */
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
  /** Each source's own window total; trading is 0 when it cannot be read. */
  totals: Record<ProfitOrigin, number>;
  /** Against the window before; null when no source read had one. */
  delta: number | null;
  buckets: ProfitBuckets;
  /** Per period, oldest first, all the same length. */
  series: { builds: number[]; trading: number[]; total: number[] };
  rows: (ProfitRow & { source: ProfitOrigin })[];
}

/** A week is the profit charts' unit; a 7-day range has too few weeks to be a chart, so days. */
export function profitBuckets(range: number): ProfitBuckets {
  const daily = range <= 7;
  return {
    daily,
    bucketMs: daily ? DAY_MS : 7 * DAY_MS,
    buckets: daily ? range : Math.ceil(range / 7),
  };
}

/**
 * Builds plus trades. `trading` is null when no Character in scope can read
 * its wallet: it is then left out, totals and comparison alike. The comparison
 * is made when any source read had a window before; one that was quiet then
 * counts as 0 there, as it really made nothing.
 */
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
