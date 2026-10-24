import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleIdle } from './scheduleIdle';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scheduleIdle', () => {
  it('runs in the idle slot, bounded by the timeout', () => {
    let idle: IdleRequestCallback | undefined;
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        idle = callback;
        return 3;
      })
    );
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    const start = vi.fn();
    scheduleIdle(start, 2000);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    expect(start).not.toHaveBeenCalled();
    idle!({ didTimeout: false, timeRemaining: () => 50 });
    expect(start).toHaveBeenCalledOnce();
  });

  it('cancels a pending idle slot', () => {
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn(() => 3)
    );
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    scheduleIdle(vi.fn(), 2000)();
    expect(cancelIdleCallback).toHaveBeenCalledWith(3);
  });

  it('falls back to a timer of fallbackMs (default: the timeout) without requestIdleCallback', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const start = vi.fn();
    scheduleIdle(start, 10_000, 2000);
    vi.advanceTimersByTime(1999);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledOnce();

    const late = vi.fn();
    scheduleIdle(late, 3000);
    vi.advanceTimersByTime(2999);
    expect(late).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(late).toHaveBeenCalledOnce();
  });

  it('cancels a pending fallback timer', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const start = vi.fn();
    scheduleIdle(start, 2000)();
    vi.advanceTimersByTime(5000);
    expect(start).not.toHaveBeenCalled();
  });
});
