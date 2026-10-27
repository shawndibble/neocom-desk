import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('./dailySales', () => ({
  loadDailySales: vi.fn((_regionId: number, typeId: number) =>
    Promise.resolve(typeId === 1 ? 2 : null)
  ),
}));
import { loadDailySales } from './dailySales';
import { useDailySales } from './useDailySales';

describe('useDailySales', () => {
  it('reads nothing while the filter is off', () => {
    const { result } = renderHook(() => useDailySales([1, 2], 10000002, false));
    expect(result.current).toEqual({ sales: new Map(), pending: 0 });
    expect(loadDailySales).not.toHaveBeenCalled();
  });

  it('reads every product once on, counting down what is left', async () => {
    const { result } = renderHook(() => useDailySales([1, 2], 10000002, true));
    expect(result.current.pending).toBe(2);
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(result.current.sales).toEqual(
      new Map([
        [1, 2],
        [2, null],
      ])
    );
  });

  it("reads in the scanned hub's region", async () => {
    const { result } = renderHook(() => useDailySales([1], 10000043, true));
    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(loadDailySales).toHaveBeenCalledWith(10000043, 1);
  });
});
