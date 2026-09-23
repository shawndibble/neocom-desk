import { describe, expect, it } from 'vitest';
import {
  MINING_YIELD_RANGES,
  daysCovered,
  filterYieldRange,
  rangeDates,
  rangeStartDate,
} from './yieldRange';

const TODAY = '2026-09-22';

describe('rangeStartDate', () => {
  it('counts today as the first day of every range', () => {
    expect(rangeStartDate('today', TODAY)).toBe('2026-09-22');
    expect(rangeStartDate('7d', TODAY)).toBe('2026-09-16');
    expect(rangeStartDate('30d', TODAY)).toBe('2026-08-24');
    expect(rangeStartDate('90d', TODAY)).toBe('2026-06-25');
  });

  it('crosses month and year boundaries on bare dates', () => {
    expect(rangeStartDate('7d', '2027-01-03')).toBe('2026-12-28');
  });

  it('offers the four ranges, widest first', () => {
    expect(MINING_YIELD_RANGES).toEqual(['90d', '30d', '7d', 'today']);
  });
});

describe('filterYieldRange', () => {
  it('keeps items dated inside the range, inclusive of both ends', () => {
    const items = [
      { date: '2026-09-15' },
      { date: '2026-09-16' },
      { date: '2026-09-22' },
      { date: '2026-09-23' },
    ];

    expect(filterYieldRange(items, '7d', TODAY)).toEqual([
      { date: '2026-09-16' },
      { date: '2026-09-22' },
    ]);
  });
});

describe('rangeDates', () => {
  it('lists every day of the range, oldest first, so the chart axis spans it even with gaps', () => {
    expect(rangeDates('7d', TODAY)).toEqual([
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
    ]);
    expect(rangeDates('today', TODAY)).toEqual(['2026-09-22']);
    expect(rangeDates('90d', TODAY)).toHaveLength(90);
  });
});

describe('daysCovered', () => {
  it('counts distinct days with data in the range against the range length', () => {
    const result = daysCovered(
      ['2026-09-20', '2026-09-20', '2026-09-21'],
      '7d',
      TODAY,
      '2026-09-01'
    );

    expect(result).toEqual({ daysWithData: 2, rangeDays: 7, historyStartsInRange: null });
  });

  it('names the oldest saved day when the range reaches back past it', () => {
    const result = daysCovered(['2026-08-13', '2026-09-22'], '90d', TODAY, '2026-08-13');

    expect(result).toEqual({ daysWithData: 2, rangeDays: 90, historyStartsInRange: '2026-08-13' });
  });

  it('says nothing about history start when nothing is saved at all', () => {
    expect(daysCovered([], '30d', TODAY, null)).toEqual({
      daysWithData: 0,
      rangeDays: 30,
      historyStartsInRange: null,
    });
  });
});
