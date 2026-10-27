import { describe, expect, it, vi } from 'vitest';
import { memoizeAsync } from './memoizeAsync';

describe('memoizeAsync', () => {
  it('runs the loader once and shares the promise', async () => {
    const loader = vi.fn(async () => 7);
    const get = memoizeAsync(loader);
    expect(await Promise.all([get(), get()])).toEqual([7, 7]);
    await get();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('rejects on failure and retries on the next call', async () => {
    const loader = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('boom'));
    loader.mockResolvedValueOnce(3);
    const get = memoizeAsync(loader);
    await expect(get()).rejects.toThrow('boom');
    expect(await get()).toBe(3);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('resolves the fallback on failure when given one, and retries after', async () => {
    const loader = vi.fn<() => Promise<number | null>>().mockRejectedValueOnce(new Error('x'));
    loader.mockResolvedValueOnce(5);
    const get = memoizeAsync(loader, { fallback: null });
    expect(await get()).toBeNull();
    expect(await get()).toBe(5);
  });

  it('reset drops the memo', async () => {
    const loader = vi.fn(async () => 1);
    const get = memoizeAsync(loader);
    await get();
    get.reset();
    await get();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('a failure from a load that reset replaced does not clear the newer memo', async () => {
    let rejectFirst: (e: Error) => void = () => {};
    const loader = vi
      .fn<() => Promise<number>>()
      .mockImplementationOnce(() => new Promise((_, rej) => (rejectFirst = rej)));
    loader.mockResolvedValue(9);
    const get = memoizeAsync(loader);
    const first = get();
    first.catch(() => {});
    get.reset();
    expect(await get()).toBe(9);
    rejectFirst(new Error('late'));
    await expect(first).rejects.toThrow('late');
    expect(await get()).toBe(9);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
