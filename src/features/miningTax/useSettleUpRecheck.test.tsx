import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { RECHECK_INTERVAL_MS, useSettleUpRecheck } from './useSettleUpRecheck';

const TODAY = '2026-10-04';

beforeEach(() => vi.useFakeTimers({ now: Date.parse(`${TODAY}T12:00:00Z`) }));
afterEach(() => vi.useRealTimers());

describe('useSettleUpRecheck', () => {
  it('pulls nothing while Settle up is closed', () => {
    const refresh = vi.fn();
    const { result } = renderHook(() =>
      useSettleUpRecheck({ dates: null, refresh, loading: false })
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current).toEqual({ checking: false, pullStartedAt: null });
  });

  it('pulls nothing when no entry on offer could still grow', () => {
    const refresh = vi.fn();
    renderHook(() => useSettleUpRecheck({ dates: ['2026-09-20'], refresh, loading: false }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('pulls as it opens and is checking until that load finishes', () => {
    const refresh = vi.fn();
    const { result, rerender } = renderHook(
      ({ loading }) => useSettleUpRecheck({ dates: [TODAY], refresh, loading }),
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
      ({ dates }: { dates: string[] | null }) =>
        useSettleUpRecheck({ dates, refresh, loading: false }),
      { initialProps: { dates: [TODAY] as string[] | null } }
    );
    // A new array with the same dates — every Tax tab render makes one — keeps the interval.
    rerender({ dates: [TODAY] });
    act(() => vi.advanceTimersByTime(RECHECK_INTERVAL_MS));
    expect(refresh).toHaveBeenCalledTimes(2);

    rerender({ dates: null });
    act(() => vi.advanceTimersByTime(RECHECK_INTERVAL_MS * 3));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
