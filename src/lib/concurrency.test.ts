import { describe, it, expect } from 'vitest';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit, createSemaphore } from './concurrency';

/** Runs `fn` over 0..n-1, recording the highest number of overlapping calls. */
async function runTracking(count: number, limit: number) {
  const order: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  await mapWithConcurrencyLimit(
    Array.from({ length: count }, (_, i) => i),
    limit,
    async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.push(item);
      inFlight -= 1;
    }
  );
  return { order, maxInFlight };
}

describe('mapWithConcurrencyLimit', () => {
  it('never exceeds the limit', async () => {
    const { maxInFlight } = await runTracking(50, 10);
    expect(maxInFlight).toBe(10);
  });

  it('visits every item exactly once', async () => {
    const { order } = await runTracking(50, 10);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('spawns no more workers than there are items', async () => {
    const { maxInFlight } = await runTracking(3, 10);
    expect(maxInFlight).toBe(3);
  });

  it('resolves on an empty list without calling fn', async () => {
    let calls = 0;
    await mapWithConcurrencyLimit([], 10, async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
  });

  it('rejects if any call rejects, rather than swallowing it', async () => {
    // Callers that want per-item isolation wrap fn themselves (roster.ts does).
    await expect(
      mapWithConcurrencyLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  it('caps the ESI fan-out at 10', () => {
    expect(ESI_FANOUT_CONCURRENCY).toBe(10);
  });
});

describe('createSemaphore', () => {
  it('hands out up to `limit` permits without waiting', async () => {
    const semaphore = createSemaphore(2);
    const first = await semaphore.acquire();
    const second = await semaphore.acquire();
    expect(semaphore.inFlight).toBe(2);
    first();
    second();
    expect(semaphore.inFlight).toBe(0);
  });

  it('makes the next caller wait until a permit is released', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    let admitted = false;
    const queued = semaphore.acquire().then((release) => {
      admitted = true;
      return release;
    });

    await Promise.resolve();
    expect(admitted).toBe(false);
    held();
    (await queued)();
    expect(admitted).toBe(true);
  });

  it('is FIFO, so a fan-out cannot starve a single queued caller', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const order: number[] = [];
    const waiters = [1, 2, 3].map((n) =>
      semaphore.acquire().then((release) => {
        order.push(n);
        release();
      })
    );

    held();
    await Promise.all(waiters);
    expect(order).toEqual([1, 2, 3]);
  });

  it('releasing twice frees only one permit', async () => {
    const semaphore = createSemaphore(1);
    const release = await semaphore.acquire();
    release();
    release();
    expect(semaphore.inFlight).toBe(0);
    const again = await semaphore.acquire();
    expect(semaphore.inFlight).toBe(1);
    again();
  });

  it('rejects a queued caller whose signal aborts, without consuming a permit', async () => {
    const semaphore = createSemaphore(1);
    const held = await semaphore.acquire();
    const controller = new AbortController();
    const queued = semaphore.acquire(controller.signal);

    controller.abort();
    await expect(queued).rejects.toThrow();

    held();
    // The abandoned waiter must not still be holding the freed permit.
    expect(semaphore.inFlight).toBe(0);
    const next = await semaphore.acquire();
    next();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const semaphore = createSemaphore(1);
    await expect(semaphore.acquire(AbortSignal.abort())).rejects.toThrow();
    expect(semaphore.inFlight).toBe(0);
  });
});
