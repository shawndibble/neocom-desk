import { shiftUtcDate } from '@/engine/localDay';
import { shiftDate } from '../miningTax/yieldRange';

export interface CoveragePeriod {
  from: string;
  to?: string;
}

export function isDayCovered(periods: readonly CoveragePeriod[], day: string): boolean {
  return periods.some((p) => day >= p.from && (p.to === undefined || day <= p.to));
}

export function closePeriod(
  periods: readonly CoveragePeriod[],
  effectiveDay: string
): CoveragePeriod[] {
  const to = shiftDate(effectiveDay, -1);
  return periods.flatMap((p) => {
    if (p.to !== undefined) return [p];
    return to < p.from ? [] : [{ from: p.from, to }];
  });
}

export function reopenPeriod(periods: readonly CoveragePeriod[], day: string): CoveragePeriod[] {
  for (const p of periods) {
    if (p.to === undefined) throw new Error('a coverage period is still open');
    if (day <= p.to) throw new Error('a new coverage period cannot overlap an earlier one');
  }
  return [...periods, { from: day }];
}

export const MAX_COVERAGE_BACKDATE_DAYS = 30;

export function clampCoverageFrom(
  periods: readonly CoveragePeriod[],
  requested: string | undefined,
  today: string
): string {
  const earliest = shiftUtcDate(today, -MAX_COVERAGE_BACKDATE_DAYS);
  let day = requested ?? today;
  if (day > today) day = today;
  if (day < earliest) day = earliest;
  for (const p of periods) {
    if (p.to === undefined) continue;
    const next = shiftUtcDate(p.to, 1);
    if (day < next) day = next;
  }
  return day;
}

export function reconnectCoverageFrom(
  periods: readonly CoveragePeriod[],
  today: string,
  joinedOn?: string
): string {
  if (!periods.some((p) => p.to !== undefined)) return today;
  const earliest = shiftUtcDate(today, -MAX_COVERAGE_BACKDATE_DAYS);
  const asked = joinedOn !== undefined && joinedOn > earliest ? joinedOn : earliest;
  return clampCoverageFrom(periods, asked, today);
}

export function filterCovered<T extends { date: string }>(
  rows: readonly T[],
  periods: readonly CoveragePeriod[]
): T[] {
  return rows.filter((row) => isDayCovered(periods, row.date));
}

export interface FeederCoverage {
  corporationId: number;
  coveragePeriods?: readonly CoveragePeriod[];
}

export function splitByCoverage<T extends { date: string; sourceCorporationId?: number }>(
  rows: readonly T[],
  bookCorporationId: number,
  feeders: readonly FeederCoverage[]
): { covered: T[]; outsideCoverage: T[] } {
  const periodsOf = new Map(feeders.map((f) => [f.corporationId, f.coveragePeriods]));
  const covered: T[] = [];
  const outsideCoverage: T[] = [];
  for (const row of rows) {
    const source = row.sourceCorporationId;
    const periods =
      source === undefined || source === bookCorporationId ? undefined : periodsOf.get(source);
    if (periods === undefined || isDayCovered(periods, row.date)) covered.push(row);
    else outsideCoverage.push(row);
  }
  return { covered, outsideCoverage };
}
