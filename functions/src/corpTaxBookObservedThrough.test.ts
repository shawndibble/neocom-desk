import { describe, expect, it } from 'vitest';
import {
  SETTLED_GRACE_MS,
  advanceObservedThrough,
  isSettledRow,
  readObservedThrough,
} from './corpTaxBookObservedThrough.js';

const DAY = 24 * 3_600_000;
const dayEnd = (date: string) => Date.parse(`${date}T00:00:00Z`) + DAY;

describe('isSettledRow', () => {
  const row = { structureId: 5000, date: '2026-10-10' };

  it('is false for a refinery with no fully merged read yet (a new one, or the first run)', () => {
    expect(isSettledRow(row, {})).toBe(false);
    expect(isSettledRow(row, { '6000': Date.parse('2027-01-01') })).toBe(false);
  });

  it('is true only once the day closed a full grace before that read', () => {
    const at = dayEnd(row.date) + SETTLED_GRACE_MS;
    expect(isSettledRow(row, { '5000': at })).toBe(true);
    expect(isSettledRow(row, { '5000': at - 1 })).toBe(false);
  });

  it('never treats today or yesterday as settled, whatever the watermark', () => {
    const w = dayEnd('2026-10-11') + 1; // a read made early on the 12th
    expect(isSettledRow({ structureId: 5000, date: '2026-10-11' }, { '5000': w })).toBe(false);
    expect(isSettledRow({ structureId: 5000, date: '2026-10-12' }, { '5000': w })).toBe(false);
  });

  it('a grace of at least a day, so ESI’s hour of cache and late ledger postings are covered', () => {
    expect(SETTLED_GRACE_MS).toBeGreaterThanOrEqual(DAY);
  });
});

describe('advanceObservedThrough', () => {
  it('records each refinery read in full at its read time', () => {
    expect(
      advanceObservedThrough({}, [
        { structureId: 5000, fetchedAt: '2026-10-18T12:00:00.000Z', truncated: false },
      ])
    ).toEqual({ '5000': Date.parse('2026-10-18T12:00:00.000Z') });
  });

  it('leaves a truncated read where it was: some of its rows were never seen', () => {
    expect(
      advanceObservedThrough({ '5000': 5 }, [
        { structureId: 5000, fetchedAt: '2026-10-18T12:00:00.000Z', truncated: true },
      ])
    ).toEqual({ '5000': 5 });
  });

  it('never moves backwards, and keeps refineries this run did not read', () => {
    const later = Date.parse('2026-10-19T00:00:00.000Z');
    expect(
      advanceObservedThrough({ '5000': later, '7000': 1 }, [
        { structureId: 5000, fetchedAt: '2026-10-18T00:00:00.000Z', truncated: false },
      ])
    ).toEqual({ '5000': later, '7000': 1 });
  });

  it('ignores an unparseable read time', () => {
    expect(
      advanceObservedThrough({}, [{ structureId: 5000, fetchedAt: 'soon', truncated: false }])
    ).toEqual({});
  });
});

describe('readObservedThrough', () => {
  it('keeps only finite numbers under integer refinery ids', () => {
    expect(readObservedThrough(undefined)).toEqual({});
    expect(readObservedThrough('x')).toEqual({});
    expect(readObservedThrough({ '5000': 7, '6000': 'x', abc: 3, '7000': Number.NaN })).toEqual({
      '5000': 7,
    });
  });
});
