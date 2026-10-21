import { shiftDate } from '../miningTax/yieldRange';

/** A feeder's coverage: UTC days, both ends inclusive; no `to` means still open. */
export interface CoveragePeriod {
  from: string;
  to?: string;
}

export function isDayCovered(periods: readonly CoveragePeriod[], day: string): boolean {
  return periods.some((p) => day >= p.from && (p.to === undefined || day <= p.to));
}

/**
 * Ends the open period the day before `effectiveDay`. A period that would end
 * before it began (left the day they joined) covered nothing, so it is dropped.
 */
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

/** A rejoin: a fresh open period on the same record. Throws if it would overlap one. */
export function reopenPeriod(periods: readonly CoveragePeriod[], day: string): CoveragePeriod[] {
  for (const p of periods) {
    if (p.to === undefined) throw new Error('a coverage period is still open');
    if (day <= p.to) throw new Error('a new coverage period cannot overlap an earlier one');
  }
  return [...periods, { from: day }];
}

/** Rows outside coverage owe nothing. */
export function filterCovered<T extends { date: string }>(
  rows: readonly T[],
  periods: readonly CoveragePeriod[]
): T[] {
  return rows.filter((row) => isDayCovered(periods, row.date));
}

/** A moon owner's coverage, as the book holds it on its feeder record. */
export interface FeederCoverage {
  corporationId: number;
  /** Absent: not known to this reader, so its rows are not tested. */
  coveragePeriods?: readonly CoveragePeriod[];
}

/**
 * Moon owner rows outside their coverage owe nothing (#4618), like mining
 * before the book's start date: kept, never billed. Only rows a known moon owner's
 * refinery recorded are tested; the book's own refineries' rows are always covered.
 */
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
