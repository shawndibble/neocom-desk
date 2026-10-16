/**
 * Omega coverage (issue #3920): how many accounts' Omega cost a pilot's net
 * income covers, per 30-day period. Pure.
 *
 * Net income is the journal net with lines between the pilot's own Characters
 * (`internal`) and PLEX bought or sold left out, so paying for PLEX never
 * counts against the ISK that pays for it. Periods are rolling 30 UTC (EVE)
 * days, whole days, the newest holding today.
 */
import { PLEX_BOUGHT_KEY, PLEX_SOLD_KEY } from './journalNetting';

const DAY_MS = 86_400_000;
export const OMEGA_PERIOD_DAYS = 30;
/** CCP's one-month price. */
export const DEFAULT_PLEX_PER_30_DAYS = 500;
/** Periods drawn at most: a year of history. */
export const MAX_PERIODS = 12;
/** Reference lines drawn at most. */
export const MAX_LEVELS = 12;

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
  /** History began inside this period, so the figure may be short. */
  partial: boolean;
}

/** ISK for one account for 30 days; null when the price or plan is unusable. */
export function accountCost(plexPrice: number | null, plexPer30Days: number): number | null {
  if (plexPrice === null || !(plexPrice > 0) || !(plexPer30Days > 0)) return null;
  return plexPrice * plexPer30Days;
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

/**
 * Oldest first. `historyStartMs` is the oldest journal line held (null: none),
 * so periods wholly before it are not made and the one it falls in is partial.
 */
export function omegaPeriods(
  rows: readonly IncomeRow[],
  now: number,
  historyStartMs: number | null
): OmegaPeriod[] {
  if (historyStartMs === null) return [];
  const span = OMEGA_PERIOD_DAYS * DAY_MS;
  const end = (Math.floor(now / DAY_MS) + 1) * DAY_MS;
  const count = Math.min(
    MAX_PERIODS,
    Math.max(1, Math.ceil((end - Math.min(historyStartMs, now)) / span))
  );
  const periods: OmegaPeriod[] = Array.from({ length: count }, (_, i) => {
    const endMs = end - (count - 1 - i) * span;
    const startMs = endMs - span;
    return { startMs, endMs, net: 0, plexSpent: 0, partial: historyStartMs > startMs };
  });
  const first = periods[0]!.startMs;
  for (const row of rows) {
    const at = Date.parse(row.date);
    if (!(at >= first) || at >= end || at > now) continue;
    const amount = row.amount ?? 0;
    const period = periods[Math.floor((at - first) / span)]!;
    if (row.refKey === PLEX_BOUGHT_KEY) period.plexSpent += Math.max(0, -amount);
    if (row.internal || row.refKey === PLEX_BOUGHT_KEY || row.refKey === PLEX_SOLD_KEY) continue;
    period.net += amount;
  }
  return periods;
}
