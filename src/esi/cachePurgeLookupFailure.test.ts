import { describe, it, expect, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { loadWithCache } from './cache';
import {
  clearCachePurgePending,
  isCachePurgePending,
  purgeCharacterCacheOrSuppress,
} from './cachePurge';

const CHAR_ID = 91;
const KEY = 'wallet:journal';

function breakSettingsLookup(): void {
  vi.spyOn(db.settings, 'where').mockImplementation(() => {
    throw new Error('DatabaseClosedError');
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await clearCachePurgePending(CHAR_ID);
});

describe('isCachePurgePending when the marker lookup itself fails', () => {
  it('resolves instead of throwing, so the caller is never taken down with it', async () => {
    breakSettingsLookup();

    await expect(isCachePurgePending(CHAR_ID)).resolves.toBe(false);
    expect(vi.mocked(db.settings.where)).toHaveBeenCalled();
  });

  it('retries the lookup on the next call rather than caching the hole', async () => {
    breakSettingsLookup();
    await isCachePurgePending(CHAR_ID);
    vi.restoreAllMocks();

    breakSettingsLookup();
    await isCachePurgePending(CHAR_ID);

    expect(vi.mocked(db.settings.where)).toHaveBeenCalled();
  });

  it('keeps the whole purge path total when EVERY store throws', async () => {
    breakSettingsLookup();
    const boom = () => {
      throw new Error('DatabaseClosedError');
    };
    vi.spyOn(db.esiCache, 'where').mockImplementation(boom);
    vi.spyOn(db.esiCache, 'clear').mockImplementation(boom);
    vi.spyOn(db.settings, 'put').mockImplementation(boom);

    await expect(isCachePurgePending(CHAR_ID)).resolves.toBe(false);
    await expect(purgeCharacterCacheOrSuppress(CHAR_ID)).resolves.toBe('suppressed');
    await expect(isCachePurgePending(CHAR_ID)).resolves.toBe(true);
  });

  it('keeps loadWithCache resolving — cache.ts promises it never throws', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: KEY, value: 'stale', fetchedAt: 1 });
    breakSettingsLookup();

    const result = await loadWithCache(CHAR_ID, KEY, async () => {
      throw new Error('offline');
    });

    expect(result).toMatchObject({ data: 'stale', fromCache: true });
  });
});
