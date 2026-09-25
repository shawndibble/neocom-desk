import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCoalescedRebuild } from './projectionRebuildScheduler';

const DELAY = 1000;

/** A write that resolves (or rejects) only when the test says so. */
function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createCoalescedRebuild', () => {
  it('cancel drops a scheduled rebuild that has not started', async () => {
    const rebuild = vi.fn(async () => {});
    const schedule = createCoalescedRebuild(rebuild, DELAY);

    schedule(Promise.resolve());
    schedule.cancel();
    await vi.advanceTimersByTimeAsync(DELAY * 5);
    expect(rebuild).not.toHaveBeenCalled();

    schedule(Promise.resolve());
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('rebuilds once after the quiet period, not per write', async () => {
    const rebuild = vi.fn(async () => {});
    const schedule = createCoalescedRebuild(rebuild, DELAY);

    for (let i = 0; i < 10; i++) {
      schedule(Promise.resolve());
      await vi.advanceTimersByTimeAsync(DELAY / 2);
    }
    expect(rebuild).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('waits for every pending write to settle, even one still running when the timer fires', async () => {
    const rebuild = vi.fn(async () => {});
    const schedule = createCoalescedRebuild(rebuild, DELAY);
    const slow = deferred();

    schedule(slow.promise);
    schedule(Promise.resolve());
    await vi.advanceTimersByTimeAsync(DELAY * 5);
    expect(rebuild).not.toHaveBeenCalled();

    slow.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('reads the final preferences: the rebuild sees every write applied', async () => {
    let prefs = 0;
    const seen: number[] = [];
    const schedule = createCoalescedRebuild(async () => {
      seen.push(prefs);
    }, DELAY);

    for (let i = 1; i <= 5; i++) {
      const write = deferred();
      schedule(write.promise.then(() => void (prefs = i)));
      // The last write is still persisting when the quiet period ends.
      setTimeout(write.resolve, DELAY + i * 100);
    }
    await vi.advanceTimersByTimeAsync(DELAY * 3);

    expect(seen).toEqual([5]);
  });

  it('still rebuilds when a write fails, logging it', async () => {
    const rebuild = vi.fn(async () => {});
    const schedule = createCoalescedRebuild(rebuild, DELAY);

    schedule(Promise.reject(new Error('sync failed')));
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'Notification preference write failed',
      expect.any(Error)
    );
  });

  it('logs a failed rebuild instead of throwing, and keeps scheduling later ones', async () => {
    const rebuild = vi.fn(async () => {
      throw new Error('upload failed');
    });
    const schedule = createCoalescedRebuild(rebuild, DELAY);

    schedule(Promise.resolve());
    await vi.advanceTimersByTimeAsync(DELAY);
    schedule(Promise.resolve());
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      'Scheduled Push projection rebuild failed',
      expect.any(Error)
    );
  });

  it('a write made while earlier writes are still settling joins that rebuild', async () => {
    const rebuild = vi.fn(async () => {});
    const schedule = createCoalescedRebuild(rebuild, DELAY);
    const slow = deferred();

    schedule(slow.promise);
    await vi.advanceTimersByTimeAsync(DELAY);
    const late = deferred();
    schedule(late.promise);
    slow.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(rebuild).not.toHaveBeenCalled();

    late.resolve();
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('a write made once a rebuild has started schedules one more', async () => {
    const inFlight = deferred();
    const rebuild = vi.fn().mockReturnValueOnce(inFlight.promise).mockResolvedValue(undefined);
    const schedule = createCoalescedRebuild(rebuild, DELAY);

    schedule(Promise.resolve());
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(rebuild).toHaveBeenCalledTimes(1);

    schedule(Promise.resolve());
    schedule(Promise.resolve());
    await vi.advanceTimersByTimeAsync(DELAY);
    inFlight.resolve();
    await vi.advanceTimersByTimeAsync(DELAY);

    expect(rebuild).toHaveBeenCalledTimes(2);
  });
});
