import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_SYNC_IDLE_TIMEOUT_MS, scheduleBootSync } from './bootSync';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubIdle() {
  let idle: IdleRequestCallback | undefined;
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((callback: IdleRequestCallback) => {
      idle = callback;
      return 7;
    })
  );
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  return () => idle!({ didTimeout: false, timeRemaining: () => 50 });
}

describe('scheduleBootSync', () => {
  it('does not sync synchronously, while the first route renders', () => {
    stubIdle();
    const sync = vi.fn();
    scheduleBootSync(91, sync);
    expect(sync).not.toHaveBeenCalled();
  });

  it('syncs the Character in the first idle slot, bounded by a timeout', () => {
    const fireIdle = stubIdle();
    const sync = vi.fn();
    scheduleBootSync(91, sync);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: BOOT_SYNC_IDLE_TIMEOUT_MS,
    });
    fireIdle();
    expect(sync).toHaveBeenCalledExactlyOnceWith(91);
  });

  it('falls back to a timer where requestIdleCallback is missing', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const sync = vi.fn();
    scheduleBootSync(91, sync);
    vi.advanceTimersByTime(BOOT_SYNC_IDLE_TIMEOUT_MS - 1);
    expect(sync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(sync).toHaveBeenCalledExactlyOnceWith(91);
  });

  it('never syncs a Character the user switched away from before the slot', () => {
    const fireIdle = stubIdle();
    const sync = vi.fn();
    const cancel = scheduleBootSync(91, sync);
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
    fireIdle();
    expect(sync).not.toHaveBeenCalled();
  });
});
