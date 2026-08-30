/**
 * The marker LOOKUP failing must not fail anything either.
 *
 * `isCachePurgePending` is awaited unguarded in two places — `esi/cache.ts`'s
 * read path (whose header promises it never throws) and
 * `auth/session.persistTokens` (whose whole point is that a cache problem
 * cannot cost the user their login). A store that throws *synchronously* on
 * `where(...)`, which is how a closed or schema-broken Dexie behaves, would
 * otherwise escape straight past both.
 *
 * Own file for the same reason as `cachePurgeHydration.test.ts`: the durable
 * lookup happens once per module registry, and vitest gives each test file a
 * fresh one. Sharing a file with anything that hydrates successfully would
 * warm the memo and make these assertions pass without ever calling
 * `db.settings.where`.
 */
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
  // Suppression is module state: a tier-3 test would otherwise leak into the
  // next one. (Between test FILES vitest already gives a fresh registry.)
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
    // What `auth/session.persistTokens` depends on: the marker lookup and the
    // purge together are a total function, so login and token refresh complete
    // no matter how badly Dexie is behaving.
    breakSettingsLookup();
    const boom = () => {
      throw new Error('DatabaseClosedError');
    };
    vi.spyOn(db.esiCache, 'where').mockImplementation(boom);
    vi.spyOn(db.esiCache, 'clear').mockImplementation(boom);
    vi.spyOn(db.settings, 'put').mockImplementation(boom);

    await expect(isCachePurgePending(CHAR_ID)).resolves.toBe(false);
    await expect(purgeCharacterCacheOrSuppress(CHAR_ID)).resolves.toBe('suppressed');
    // Suppression survives in memory even though nothing could be written.
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
