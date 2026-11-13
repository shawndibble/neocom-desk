import { describe, expect, it } from 'vitest';
import { recentHullIds } from './useRecentHulls';

describe('recentHullIds', () => {
  it('lists each hull once, most recently saved first, up to the limit', () => {
    expect(
      recentHullIds(
        [
          { hullTypeId: 1, updatedAt: 10 },
          { hullTypeId: 2, updatedAt: 40 },
          { hullTypeId: 1, updatedAt: 50 },
          { hullTypeId: 3, updatedAt: 30 },
          { hullTypeId: 4, updatedAt: 20 },
        ],
        3
      )
    ).toEqual([1, 2, 3]);
  });

  it('is empty with nothing saved', () => {
    expect(recentHullIds([], 5)).toEqual([]);
  });
});
