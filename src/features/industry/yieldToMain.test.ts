import { describe, expect, it, vi } from 'vitest';
import { createYielder, yieldToMain } from './yieldToMain';

describe('createYielder', () => {
  it('yields only once the budget is spent, then restarts the clock', async () => {
    let t = 0;
    const yieldFn = vi.fn(() => Promise.resolve());
    const maybeYield = createYielder(8, () => t, yieldFn);
    t = 7;
    await maybeYield();
    expect(yieldFn).not.toHaveBeenCalled();
    t = 8;
    await maybeYield();
    expect(yieldFn).toHaveBeenCalledTimes(1);
    t = 15;
    await maybeYield();
    expect(yieldFn).toHaveBeenCalledTimes(1);
    t = 16;
    await maybeYield();
    expect(yieldFn).toHaveBeenCalledTimes(2);
  });
});

describe('yieldToMain', () => {
  it('prefers scheduler.yield', async () => {
    const y = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scheduler', { yield: y });
    await yieldToMain();
    expect(y).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('falls back without scheduler.yield', async () => {
    vi.stubGlobal('scheduler', undefined);
    await expect(yieldToMain()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
