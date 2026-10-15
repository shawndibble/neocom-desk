import { describe, expect, it } from 'vitest';
import { newArrivals } from './localDiff';

const names = (n: number) => Array.from({ length: n }, (_, i) => `Pilot ${i}`);

describe('newArrivals', () => {
  it('marks nothing on the first paste', () => {
    expect(newArrivals(names(5), null)).toBeNull();
    expect(newArrivals(names(5), [])).toBeNull();
  });

  it('returns an empty set when the same names are pasted again', () => {
    expect(newArrivals(names(5), names(5))).toEqual(new Set());
  });

  it('returns only the names missing from the previous paste', () => {
    expect(newArrivals([...names(9), 'Newcomer'], names(9))).toEqual(new Set(['Newcomer']));
  });

  it('matches names case-insensitively', () => {
    expect(newArrivals(['PILOT 0', 'Fresh'], ['pilot 0'])).toEqual(new Set(['Fresh']));
  });

  it('marks at exactly half overlap and not below it', () => {
    expect(newArrivals(['A', 'B', 'C', 'D'], ['A', 'B'])).toEqual(new Set(['C', 'D']));
    expect(newArrivals(['A', 'B', 'C', 'D'], ['A'])).toBeNull();
  });

  it('marks nothing for a different system entirely', () => {
    expect(newArrivals(['A', 'B'], ['X', 'Y'])).toBeNull();
  });
});
