import { PLEX_BOUGHT_KEY, PLEX_SOLD_KEY } from './journalNetting';
import { ARCHIVE_DAYS } from './wallet/archiveCoverage';
import { parseInstant } from './esiInstant';
import { DAY_MS } from '@/lib/age';

export const OMEGA_PERIOD_DAYS = 30;
export const DEFAULT_PLEX_PER_30_DAYS = 500;
export const MAX_LEVELS = 1000;
export const MAX_DRAWN_LINES = 6;

export interface IncomeRow {
  date: string;
  amount?: number;
  internal?: boolean;
  refKey?: string;
}

export interface OmegaPeriod {
  startMs: number;
  endMs: number;
  net: number;
  plexSpent: number;
  partial: boolean;
}

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

export function nextAccountGap(net: number, cost: number): number {
  return (accountsCovered(net, cost) + 1) * cost - net;
}

export function referenceLevels(nets: readonly number[], cost: number): number[] {
  const tallest = Math.max(0, ...nets);
  const top = Math.min(MAX_LEVELS, Math.floor(tallest / cost) + 1);
  return Array.from({ length: top }, (_, i) => i + 1);
}

export function drawnLevels(levels: readonly number[]): number[] {
  const step = Math.ceil(levels.length / MAX_DRAWN_LINES);
  return step <= 1 ? [...levels] : levels.filter((_, i) => (i + 1) % step === 0);
}

export interface HistoryCoverage {
  since: number;
  gaps: ReadonlyArray<readonly [number, number]>;
}

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
