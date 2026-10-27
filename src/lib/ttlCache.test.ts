import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTtlCache } from '@/lib/ttlCache';

describe('createTtlCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shares one in-flight load between concurrent callers', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 5 });
    const load = vi.fn().mockResolvedValue(1);
    const [a, b] = await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect([a, b]).toEqual([1, 1]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reuses a settled answer until the ttl passes', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 5 });
    const load = vi.fn().mockResolvedValue(1);
    await cache.get('k', load);
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never keeps a null (failed) answer', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 5 });
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(2);
    expect(await cache.get('k', load)).toBeNull();
    expect(await cache.get('k', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ttl 0 dedupes in flight only', async () => {
    const cache = createTtlCache<number>({ ttlMs: 0, max: 5 });
    const load = vi.fn().mockResolvedValue(1);
    await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('drops the oldest entry past max', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 2 });
    const load = vi.fn().mockResolvedValue(1);
    await cache.get('a', load);
    await cache.get('b', load);
    await cache.get('c', load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.get('b', load);
    await cache.get('c', load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('treats a throwing load as a failure and retries', async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 5 });
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(3);
    expect(await cache.get('k', load)).toBeNull();
    expect(await cache.get('k', load)).toBe(3);
  });
});
