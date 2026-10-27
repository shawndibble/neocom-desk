import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTicker } from './ticker';

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
