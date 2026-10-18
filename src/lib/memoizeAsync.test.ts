import { describe, expect, it, vi } from 'vitest';
import { memoizeAsync } from './memoizeAsync';

describe('memoizeAsync', () => {
  it('runs the loader once and shares the promise', async () => {
    const loader = vi.fn().mockResolvedValue(1);
    const get = memoizeAsync(loader);
    expect(await Promise.all([get(), get()])).toEqual([1, 1]);
    expect(await get()).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('rejects on failure and retries on the next call', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(2);
    const get = memoizeAsync(loader);
    await expect(get()).rejects.toThrow('boom');
    expect(await get()).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('resolves the fallback on failure, unmemoized', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(3);
    const get = memoizeAsync<number, null>(loader, { fallback: null });
    expect(await get()).toBeNull();
    expect(await get()).toBe(3);
  });

  it('reset drops the memo', async () => {
    const loader = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const get = memoizeAsync(loader);
    expect(await get()).toBe(1);
    get.reset();
    expect(await get()).toBe(2);
  });

  it('a failure from a load that reset already replaced does not drop the newer memo', async () => {
    let rejectFirst: (e: Error) => void = () => {};
    const loader = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, rej) => (rejectFirst = rej)))
      .mockResolvedValue('second');
    const get = memoizeAsync<string, null>(loader, { fallback: null });
    const first = get();
    get.reset();
    expect(await get()).toBe('second');
    rejectFirst(new Error('late'));
    expect(await first).toBeNull();
    expect(await get()).toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
