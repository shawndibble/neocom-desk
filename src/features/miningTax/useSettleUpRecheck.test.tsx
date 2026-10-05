import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { RECHECK_INTERVAL_MS, useSettleUpRecheck } from './useSettleUpRecheck';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useSettleUpRecheck', () => {
  it('pulls nothing while Settle up has no entry that could still grow', () => {
    const refresh = vi.fn();
    const { result } = renderHook(() =>
      useSettleUpRecheck({ active: false, refresh, loading: false })
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current).toEqual({ checking: false, pullStartedAt: null });
  });

  it('pulls as it opens and is checking until that load finishes', () => {
    const refresh = vi.fn();
    const { result, rerender } = renderHook(
      ({ loading }) => useSettleUpRecheck({ active: true, refresh, loading }),
      { initialProps: { loading: false } }
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.checking).toBe(true);
    expect(result.current.pullStartedAt).not.toBeNull();

    rerender({ loading: true });
    expect(result.current.checking).toBe(true);
    rerender({ loading: false });
    expect(result.current.checking).toBe(false);
  });

  it('pulls again once per ESI cache window while it stays open, and stops when it closes', () => {
    const refresh = vi.fn();
    const { rerender } = renderHook(
      ({ active }) => useSettleUpRecheck({ active, refresh, loading: false }),
      { initialProps: { active: true } }
    );
    act(() => vi.advanceTimersByTime(RECHECK_INTERVAL_MS));
    expect(refresh).toHaveBeenCalledTimes(2);

    rerender({ active: false });
    act(() => vi.advanceTimersByTime(RECHECK_INTERVAL_MS * 3));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
