import { describe, expect, it } from 'vitest';
import { idSetKey } from './idSetKey';

describe('idSetKey', () => {
  it('sorts numerically ascending and joins with commas', () => {
    expect(idSetKey([10, 9, 100, 2])).toBe('2,9,10,100');
  });

  it('is order- and duplicate-insensitive', () => {
    expect(idSetKey([3, 1, 3, 2])).toBe(idSetKey(new Set([2, 3, 1])));
  });

  it('returns an empty string for no ids', () => {
    expect(idSetKey([])).toBe('');
  });

  it('does not mutate its input', () => {
    const ids = [3, 1, 2];
    idSetKey(ids);
    expect(ids).toEqual([3, 1, 2]);
  });
});
