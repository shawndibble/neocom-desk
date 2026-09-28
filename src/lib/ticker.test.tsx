import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTicker, subscribeTicker, useTicker } from './ticker';

const T0 = new Date('2026-08-29T12:00:00Z').getTime();

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('shared ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    setHidden(false);
    vi.useRealTimers();
  });

  it('runs one interval for any number of subscribers at the same cadence', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeTicker(1_000, a);
    const offB = subscribeTicker(1_000, b);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(readTicker(1_000)).toBe(T0 + 1_000);

    offA();
    offB();
    setIntervalSpy.mockRestore();
  });

  it('stops ticking once the last subscriber leaves', () => {
    const listener = vi.fn();
    const off = subscribeTicker(2_000, listener);
    off();
    vi.advanceTimersByTime(10_000);
    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses while the document is hidden and ticks immediately when it is visible again', () => {
    const listener = vi.fn();
    const off = subscribeTicker(3_000, listener);

    setHidden(true);
    vi.advanceTimersByTime(30_000);
    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    setHidden(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readTicker(3_000)).toBe(T0 + 30_000);

    vi.advanceTimersByTime(3_000);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('does not hand a new reader a value older than its cadence', () => {
    const off = subscribeTicker(4_000, () => {});
    off();
    vi.setSystemTime(T0 + 60_000);
    expect(readTicker(4_000)).toBe(T0 + 60_000);
  });

  it('refreshes the shared reading for everyone when a subscriber joins mid-interval', () => {
    const first = vi.fn();
    const offFirst = subscribeTicker(60_000, first);
    vi.advanceTimersByTime(40_000);
    expect(readTicker(60_000)).toBe(T0);

    const offSecond = subscribeTicker(60_000, () => {});
    expect(readTicker(60_000)).toBe(T0 + 40_000);
    expect(first).toHaveBeenCalledTimes(1);

    // Joining again within the freshness window does not churn subscribers.
    const offThird = subscribeTicker(60_000, () => {});
    expect(first).toHaveBeenCalledTimes(1);
    offFirst();
    offSecond();
    offThird();
  });

  it('useTicker re-renders on each tick', () => {
    const { result, unmount } = renderHook(() => useTicker(5_000));
    expect(result.current).toBe(T0);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(T0 + 5_000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
