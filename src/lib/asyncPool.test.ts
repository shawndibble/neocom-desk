import { describe, expect, it } from 'vitest';
import { runPool } from './asyncPool';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runPool', () => {
  it('runs every item once and keeps at most `concurrency` in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      seen.push(n);
      inFlight -= 1;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it('starts items in list order', async () => {
    const started: number[] = [];
    await runPool([1, 2, 3, 4], 2, async (n) => {
      started.push(n);
      await tick();
    });
    expect(started).toEqual([1, 2, 3, 4]);
  });

  it('stops taking new items once told to, letting the ones in flight finish', async () => {
    let stop = false;
    const done: number[] = [];
    await runPool(
      [1, 2, 3, 4, 5, 6],
      2,
      async (n) => {
        await tick();
        done.push(n);
        if (n === 2) stop = true;
      },
      () => stop
    );
    expect(done).toContain(2);
    expect(done).not.toContain(6);
  });

  it('carries on past a worker that throws, then reports it', async () => {
    const done: number[] = [];
    await expect(
      runPool([1, 2, 3], 1, async (n) => {
        if (n === 2) throw new Error('boom');
        done.push(n);
      })
    ).rejects.toThrow('boom');
    expect(done).toEqual([1, 3]);
  });

  it('handles an empty list', async () => {
    await expect(runPool([], 4, async () => {})).resolves.toBeUndefined();
  });
});
