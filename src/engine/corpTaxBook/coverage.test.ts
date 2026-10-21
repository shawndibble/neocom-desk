import { describe, expect, it } from 'vitest';
import {
  closePeriod,
  filterCovered,
  isDayCovered,
  reopenPeriod,
  splitByCoverage,
} from './coverage';

describe('isDayCovered', () => {
  it('covers an open period from its first day on', () => {
    const periods = [{ from: '2026-07-10' }];
    expect(isDayCovered(periods, '2026-07-09')).toBe(false);
    expect(isDayCovered(periods, '2026-07-10')).toBe(true);
    expect(isDayCovered(periods, '2027-01-01')).toBe(true);
  });

  it('covers a closed period through its last day, inclusive', () => {
    const periods = [{ from: '2026-07-10', to: '2026-07-12' }];
    expect(isDayCovered(periods, '2026-07-12')).toBe(true);
    expect(isDayCovered(periods, '2026-07-13')).toBe(false);
  });

  it('covers nothing with no periods', () => {
    expect(isDayCovered([], '2026-07-10')).toBe(false);
  });

  it('leaves the gap between periods uncovered', () => {
    const periods = [{ from: '2026-07-01', to: '2026-07-05' }, { from: '2026-07-09' }];
    expect(isDayCovered(periods, '2026-07-07')).toBe(false);
    expect(isDayCovered(periods, '2026-07-09')).toBe(true);
  });
});

describe('closePeriod', () => {
  it('ends the open period the day before the effective day', () => {
    expect(closePeriod([{ from: '2026-07-01' }], '2026-07-10')).toEqual([
      { from: '2026-07-01', to: '2026-07-09' },
    ]);
  });

  it('leaves the effective day itself uncovered', () => {
    const closed = closePeriod([{ from: '2026-07-01' }], '2026-07-10');
    expect(isDayCovered(closed, '2026-07-09')).toBe(true);
    expect(isDayCovered(closed, '2026-07-10')).toBe(false);
  });

  it('drops a period that would end before it began (left the day they joined)', () => {
    expect(closePeriod([{ from: '2026-07-10' }], '2026-07-10')).toEqual([]);
  });

  it('keeps earlier periods and does not mutate its input', () => {
    const periods = [{ from: '2026-06-01', to: '2026-06-30' }, { from: '2026-07-01' }];
    const closed = closePeriod(periods, '2026-07-04');
    expect(closed).toEqual([
      { from: '2026-06-01', to: '2026-06-30' },
      { from: '2026-07-01', to: '2026-07-03' },
    ]);
    expect(periods[1]).toEqual({ from: '2026-07-01' });
  });

  it('is a no-op when no period is open', () => {
    const periods = [{ from: '2026-06-01', to: '2026-06-30' }];
    expect(closePeriod(periods, '2026-07-04')).toEqual(periods);
  });
});

describe('reopenPeriod', () => {
  it('appends an open period on rejoin', () => {
    const periods = [{ from: '2026-06-01', to: '2026-06-30' }];
    expect(reopenPeriod(periods, '2026-07-15')).toEqual([
      { from: '2026-06-01', to: '2026-06-30' },
      { from: '2026-07-15' },
    ]);
  });

  it('allows back-to-back periods: leave and rejoin on the same day leaves no gap', () => {
    const left = closePeriod([{ from: '2026-06-01' }], '2026-07-10');
    const back = reopenPeriod(left, '2026-07-10');
    expect(isDayCovered(back, '2026-07-09')).toBe(true);
    expect(isDayCovered(back, '2026-07-10')).toBe(true);
  });

  it('refuses while a period is still open', () => {
    expect(() => reopenPeriod([{ from: '2026-06-01' }], '2026-07-10')).toThrow();
  });

  it('refuses to overlap a closed period', () => {
    expect(() => reopenPeriod([{ from: '2026-06-01', to: '2026-06-30' }], '2026-06-30')).toThrow();
  });
});

describe('filterCovered', () => {
  it('keeps only rows dated inside coverage (rows outside owe nothing)', () => {
    const periods = [{ from: '2026-07-10', to: '2026-07-12' }];
    const rows = [{ date: '2026-07-09' }, { date: '2026-07-10' }, { date: '2026-07-13' }];
    expect(filterCovered(rows, periods)).toEqual([{ date: '2026-07-10' }]);
  });
});

describe('splitByCoverage (moon owner rows, #4618)', () => {
  const BOOK = 98000001;
  const OWNER = 98000002;
  const feeders = [
    {
      corporationId: OWNER,
      coveragePeriods: [{ from: '2026-07-10', to: '2026-07-12' }, { from: '2026-07-20' }],
    },
  ];
  const fed = (date: string) => ({ date, sourceCorporationId: OWNER });

  it('puts a moon owner row before its coverage starts outside coverage', () => {
    const out = splitByCoverage([fed('2026-07-09')], BOOK, feeders);
    expect(out.covered).toEqual([]);
    expect(out.outsideCoverage).toEqual([fed('2026-07-09')]);
  });

  it('puts a moon owner row after its coverage ended outside coverage', () => {
    expect(splitByCoverage([fed('2026-07-13')], BOOK, feeders).outsideCoverage).toEqual([
      fed('2026-07-13'),
    ]);
  });

  it('covers a row inside a rejoined second period, and still open', () => {
    const out = splitByCoverage([fed('2026-07-20'), fed('2026-12-01')], BOOK, feeders);
    expect(out.covered).toEqual([fed('2026-07-20'), fed('2026-12-01')]);
    expect(out.outsideCoverage).toEqual([]);
  });

  it('never tests the book’s own rows, nor rows of a moon owner it has no record of', () => {
    const own = [{ date: '2026-07-01' }, { date: '2026-07-01', sourceCorporationId: BOOK }];
    const stranger = { date: '2026-07-01', sourceCorporationId: 98000099 };
    const out = splitByCoverage([...own, stranger], BOOK, feeders);
    expect(out.covered).toEqual([...own, stranger]);
    expect(out.outsideCoverage).toEqual([]);
  });
});
