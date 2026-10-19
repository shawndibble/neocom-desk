/**
 * Omega coverage (issue #3920): how many accounts' Omega cost a pilot's net
 * income covers, per window (30 days by default; the widget range sets it). Pure.
 *
 * Net income is the journal net with lines between the pilot's own Characters
 * (`internal`) and PLEX bought or sold left out, so paying for PLEX never
 * counts against the ISK that pays for it. Periods are rolling windows
 * ending now, so the newest is a true last-N-days figure.
 */
import { PLEX_BOUGHT_KEY, PLEX_SOLD_KEY } from './journalNetting';
import { ARCHIVE_DAYS } from './wallet/archiveCoverage';
import { parseInstant } from './esiInstant';
import { DAY_MS } from '@/lib/age';

export const OMEGA_PERIOD_DAYS = 30;
/** CCP's one-month price. */
export const DEFAULT_PLEX_PER_30_DAYS = 500;
/** Safety cap on levels worked out (the drawn lines are stepped, see `drawnLevels`). */
export const MAX_LEVELS = 1000;
/** More reference lines than this bunch up, so they are stepped. */
export const MAX_DRAWN_LINES = 6;

/** The slice of a classified journal line this reads. */
export interface IncomeRow {
  date: string;
  amount?: number;
  internal?: boolean;
  refKey?: string;
}

export interface OmegaPeriod {
  startMs: number;
  /** Exclusive. */
  endMs: number;
  net: number;
  /** ISK paid for PLEX bought in the period, as a positive figure. */
  plexSpent: number;
  /** Local history began inside this period or has a gap in it, so the figure may be short. */
  partial: boolean;
}

/**
 * ISK for one account for a `days` window (default 30), scaled days / 30; null
 * when the price, plan or window is unusable.
 */
export function accountCost(
  plexPrice: number | null,
  plexPer30Days: number,
  days: number = OMEGA_PERIOD_DAYS
): number | null {
  if (plexPrice === null || !(plexPrice > 0) || !(plexPer30Days > 0) || !(days > 0)) return null;
  return (plexPrice * plexPer30Days * days) / OMEGA_PERIOD_DAYS;
}

export function accountsCovered(net: number, cost: number): number {
  return net > 0 && cost > 0 ? Math.floor(net / cost) : 0;
}

/** ISK more per period the next account needs. */
export function nextAccountGap(net: number, cost: number): number {
  return (accountsCovered(net, cost) + 1) * cost - net;
}

/** 1, 2, 3... up to one above the tallest bar (capped); at least 1. */
export function referenceLevels(nets: readonly number[], cost: number): number[] {
  const tallest = Math.max(0, ...nets);
  const top = Math.min(MAX_LEVELS, Math.floor(tallest / cost) + 1);
  return Array.from({ length: top }, (_, i) => i + 1);
}

/** Every level when few; else every k-th (k = ceil(n / 6)), so lines stay apart. */
export function drawnLevels(levels: readonly number[]): number[] {
  const step = Math.ceil(levels.length / MAX_DRAWN_LINES);
  return step <= 1 ? [...levels] : levels.filter((_, i) => (i + 1) % step === 0);
}

/** What one Character's local journal truly covers (`loadWalletArchiveInfo`). */
export interface HistoryCoverage {
  /** Start of the earliest covered window (ms). */
  since: number;
  /** Uncovered stretches [from, to) (ms). */
  gaps: ReadonlyArray<readonly [number, number]>;
}

/**
 * Oldest first, rolling `days`-day (default 30) windows ending at `now`. A period is partial
 * when it starts before any Character's `since` or overlaps any one's gap.
 * No coverage, no periods.
 */
export function omegaPeriods(
  rows: readonly IncomeRow[],
  now: number,
  coverage: readonly HistoryCoverage[],
  days: number = OMEGA_PERIOD_DAYS
): OmegaPeriod[] {
  const sinces = coverage.map((c) => c.since).filter(Number.isFinite);
  if (sinces.length === 0) return [];
  const gaps = coverage
    .flatMap((c) => c.gaps)
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to));
  const span = days * DAY_MS;
  const oldest = Math.min(...sinces);
  const count = Math.min(
    Math.ceil(ARCHIVE_DAYS / days),
    Math.max(1, Math.ceil((now - oldest) / span))
  );
  const youngest = Math.max(...sinces);
  const periods: OmegaPeriod[] = Array.from({ length: count }, (_, i) => {
    const endMs = now - (count - 1 - i) * span;
    const startMs = endMs - span;
    const partial = youngest > startMs || gaps.some(([from, to]) => from < endMs && to > startMs);
    return { startMs, endMs, net: 0, plexSpent: 0, partial };
  });
  const first = periods[0]!.startMs;
  for (const row of rows) {
    const at = parseInstant(row.date);
    if (at === null || at < first || at > now) continue;
    const amount = row.amount ?? 0;
    const period = periods[Math.min(count - 1, Math.floor((at - first) / span))]!;
    if (row.refKey === PLEX_BOUGHT_KEY) period.plexSpent += Math.max(0, -amount);
    if (row.internal || row.refKey === PLEX_BOUGHT_KEY || row.refKey === PLEX_SOLD_KEY) continue;
    period.net += amount;
  }
  return periods;
}
