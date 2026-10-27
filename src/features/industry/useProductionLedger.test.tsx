import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProductionLedger } from './useProductionLedger';

describe('useProductionLedger', () => {
  it('returns identity-stable empties before Dexie answers', () => {
    const { result, rerender } = renderHook(() => useProductionLedger(1, { byPlanId: 'p' }));
    const first = result.current;
    rerender();
    expect(result.current.runs).toBe(first.runs);
    expect(result.current.saleLinks).toBe(first.saleLinks);
    expect(result.current.orderWatches).toBe(first.orderWatches);
    expect(result.current.losses).toBe(first.losses);
    expect(first.runs).toEqual([]);
  });
});
