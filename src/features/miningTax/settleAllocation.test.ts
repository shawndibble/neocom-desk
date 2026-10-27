import { describe, expect, it } from 'vitest';
import { allocateOldestFirst } from './settleAllocation';

const entries = [
  { id: 'c', date: '2026-10-03', taxOwed: 4_309_281 },
  { id: 'a', date: '2026-09-27', taxOwed: 2_000_000.4 },
  { id: 'b', date: '2026-09-30', taxOwed: 9_335_036 },
];

describe('allocateOldestFirst', () => {
  it('covers every entry when the amount pays them all', () => {
    const result = allocateOldestFirst(entries, 15_644_317);
    expect(result.coveredIds).toEqual(['a', 'b', 'c']);
    expect(result.leftover).toBe(0);
  });

  it('covers the oldest entries the amount fully pays and leaves the rest owed', () => {
    const result = allocateOldestFirst(entries, 12_000_000);
    expect(result.coveredIds).toEqual(['a', 'b']);
    expect(result.coveredTotal).toBeCloseTo(11_335_036.4);
    expect(result.leftover).toBeCloseTo(664_963.6);
  });

  it('stops at the first entry the remainder cannot pay — never skips ahead to a newer one', () => {
    const result = allocateOldestFirst(entries, 2_500_000);
    expect(result.coveredIds).toEqual(['a']);
  });

  it('tolerates the whole-ISK rounding of the in-game transfer', () => {
    expect(allocateOldestFirst([entries[1]], 2_000_000).coveredIds).toEqual(['a']);
  });

  it('covers nothing for zero or a non-number', () => {
    expect(allocateOldestFirst(entries, 0).coveredIds).toEqual([]);
    expect(allocateOldestFirst(entries, Number.NaN).coveredIds).toEqual([]);
  });
});
