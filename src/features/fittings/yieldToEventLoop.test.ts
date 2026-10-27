import { afterEach, describe, expect, it, vi } from 'vitest';
import { yieldToEventLoop } from './yieldToEventLoop';

/** Resolves after `depth` chained microtasks — all of which run before any macrotask. */
async function microtaskChain(depth: number): Promise<void> {
  for (let i = 0; i < depth; i++) await Promise.resolve();
}

describe('yieldToEventLoop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the browser's scheduler.yield() when there is one", async () => {
    const schedulerYield = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scheduler', { yield: schedulerYield });

    await yieldToEventLoop();

    expect(schedulerYield).toHaveBeenCalledTimes(1);
  });

  it('otherwise waits for a macrotask, not just the microtask queue', async () => {
    vi.stubGlobal('scheduler', undefined);
    const order: string[] = [];

    await Promise.all([
      yieldToEventLoop().then(() => order.push('yield')),
      microtaskChain(50).then(() => order.push('microtasks')),
    ]);

    // An `await` on an already-settled promise would land first here — and
    // leave every variant calculation in one long task.
    expect(order).toEqual(['microtasks', 'yield']);
  });

  it('falls back to setTimeout where there is no MessageChannel either', async () => {
    vi.stubGlobal('scheduler', undefined);
    vi.stubGlobal('MessageChannel', undefined);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await yieldToEventLoop();

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
    setTimeoutSpy.mockRestore();
  });
});
