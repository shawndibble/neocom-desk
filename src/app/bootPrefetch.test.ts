import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_PREFETCH_IDLE_TIMEOUT_MS, scheduleBootPrefetch } from './bootPrefetch';
import { prefetchCharacterData, type PrefetchSignal } from './prefetch';

vi.mock('./prefetch', () => ({ prefetchCharacterData: vi.fn(async () => {}) }));

/** Let the dynamic `import('./prefetch')` settle. */
const flush = () => vi.dynamicImportSettled();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scheduleBootPrefetch', () => {
  it('does not start the warm-up synchronously, at first paint', async () => {
    scheduleBootPrefetch(91);
    await flush();
    expect(prefetchCharacterData).not.toHaveBeenCalled();
  });

  it('starts once the browser is idle', async () => {
    let idle: IdleRequestCallback | undefined;
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        idle = callback;
        return 1;
      })
    );
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    scheduleBootPrefetch(91);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: BOOT_PREFETCH_IDLE_TIMEOUT_MS,
    });
    idle!({ didTimeout: false, timeRemaining: () => 50 });
    await flush();

    expect(prefetchCharacterData).toHaveBeenCalledWith(91, { cancelled: false });
  });

  it('falls back to a timer where requestIdleCallback is missing', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    scheduleBootPrefetch(91);
    await vi.advanceTimersByTimeAsync(BOOT_PREFETCH_IDLE_TIMEOUT_MS);
    await flush();
    expect(prefetchCharacterData).toHaveBeenCalledWith(91, expect.any(Object));
  });

  it('never starts once cancelled before the idle slot (a character switch)', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const cancel = scheduleBootPrefetch(91);
    cancel();
    await vi.advanceTimersByTimeAsync(BOOT_PREFETCH_IDLE_TIMEOUT_MS);
    await flush();
    expect(prefetchCharacterData).not.toHaveBeenCalled();
  });

  it('cancels a run already under way', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const cancel = scheduleBootPrefetch(91);
    await vi.advanceTimersByTimeAsync(BOOT_PREFETCH_IDLE_TIMEOUT_MS);
    await flush();
    const signal = vi.mocked(prefetchCharacterData).mock.calls[0][1] as PrefetchSignal;
    expect(signal.cancelled).toBe(false);

    cancel();

    expect(signal.cancelled).toBe(true);
  });
});
