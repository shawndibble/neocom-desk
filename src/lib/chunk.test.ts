import { describe, it, expect } from 'vitest';
import { chunk } from './chunk';

describe('chunk', () => {
  it('splits into batches with a short tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns no batches for an empty list', () => {
    expect(chunk([], 3)).toEqual([]);
  });
  it('keeps a list shorter than the size in one batch', () => {
    expect(chunk(['a'], 10)).toEqual([['a']]);
  });
});
