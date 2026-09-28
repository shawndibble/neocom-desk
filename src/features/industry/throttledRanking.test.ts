import { describe, expect, it, vi } from 'vitest';
import { throttledRanker } from './throttledRanking';

describe('throttledRanker', () => {
  it('ranks on the first call, then reuses that result until the interval passes', () => {
    let clock = 0;
    const rank = vi.fn((rows: readonly number[]) => [...rows].sort((a, b) => b - a));
    const progress = throttledRanker(rank, 500, () => clock);

    const first = progress([1, 3]);
    expect(first).toEqual([3, 1]);

    clock = 499;
    // Still inside the interval: the same array, so a table keyed on it doesn't re-sort.
    expect(progress([1, 3, 2])).toBe(first);
    expect(rank).toHaveBeenCalledTimes(1);

    clock = 500;
    expect(progress([1, 3, 2, 5])).toEqual([5, 3, 2, 1]);
    expect(rank).toHaveBeenCalledTimes(2);
  });
});
