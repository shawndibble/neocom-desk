import { describe, it, expect } from 'vitest';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from './concurrency';

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
