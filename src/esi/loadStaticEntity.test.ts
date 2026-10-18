import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID, loadStaticEntity, resetRevalidationState } from './cache';
import type { EsiResult } from './client';

function esiResult<T>(data: T, etag: string | null = null): EsiResult<T> {
  return { data, etag, pages: 1, expires: null, notModified: false };
}

beforeEach(async () => {
  await db.esiCache.clear();
  await db.esiCacheMeta.clear();
  resetRevalidationState();
});

describe('loadStaticEntity', () => {
  it('fetches live and stores under the global sentinel as <prefix>:<id>', async () => {
    const fetcher = vi.fn(async (id: number) => esiResult({ name: `s${id}` }, '"e1"'));
    const result = await loadStaticEntity('station', 7, fetcher);
    expect(result?.data).toEqual({ name: 's7' });
    expect(fetcher).toHaveBeenCalledWith(7, { etag: undefined });
    const row = await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, 'station:7']);
    expect(row?.value).toEqual({ name: 's7' });
    expect(row?.etag).toBe('"e1"');
  });

  it('serves a fresh cached row without calling the fetcher', async () => {
    const fetcher = vi.fn(async () => esiResult({ name: 'live' }));
    await loadStaticEntity('system', 3, fetcher);
    const second = await loadStaticEntity('system', 3, fetcher);
    expect(second?.data).toEqual({ name: 'live' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('is null when the fetch fails and nothing is cached', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await loadStaticEntity('system', 9, fetcher)).toBeNull();
  });
});
