import { describe, expect, it } from 'vitest';
import { runPool } from './asyncPool.js';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('runPool', () => {
  it('keeps at most `concurrency` in flight and runs every item', async () => {
    let inFlight = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      done.push(n);
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('takes no new item once told to stop; the running ones finish', async () => {
    const started: number[] = [];
    let stop = false;
    await runPool(
      [1, 2, 3, 4, 5],
      2,
      async (n) => {
        started.push(n);
        await tick();
        if (n === 2) stop = true;
      },
      () => stop
    );
    expect(started).toEqual([1, 2, 3]);
  });

  it('attempts every item when one throws, then throws the first error', async () => {
    const seen: number[] = [];
    await expect(
      runPool([1, 2, 3], 1, async (n) => {
        seen.push(n);
        if (n === 1) throw new Error('one');
      })
    ).rejects.toThrow('one');
    expect(seen).toEqual([1, 2, 3]);
  });
});
