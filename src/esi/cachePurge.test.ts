import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID, corpCacheKey } from './cache';
import {
  CACHE_PURGE_PENDING_PREFIX,
  clearCachePurgePending,
  isCachePurgePending,
  purgeCharacterCache,
  purgeCharacterCacheOrSuppress,
  purgeCorpScopedCache,
} from './cachePurge';

const CHAR_ID = 91;
const NEIGHBOUR_BELOW = 90;
const NEIGHBOUR_ABOVE = 92;

async function seed(characterId: number, key: string): Promise<void> {
  await db.esiCache.put({ characterId, key, value: `${characterId}:${key}`, fetchedAt: 1 });
}

async function keysFor(characterId: number): Promise<string[]> {
  const rows = await db.esiCache.toArray();
  return rows.filter((r) => r.characterId === characterId).map((r) => r.key);
}

beforeEach(async () => {
  await db.esiCache.clear();
});

describe('purgeCharacterCache', () => {
  it('deletes every cached row for the character, whatever the key', async () => {
    await seed(CHAR_ID, 'wallet:balance');
    await seed(CHAR_ID, 'mail:headers');
    await seed(CHAR_ID, 'mail:12345');
    await seed(CHAR_ID, 'assets');

    const deleted = await purgeCharacterCache(CHAR_ID);

    expect(deleted).toBe(4);
    expect(await keysFor(CHAR_ID)).toEqual([]);
  });

  it('spares GLOBAL_CACHE_CHARACTER_ID rows — public universe data behind no scope', async () => {
    // Public reference data: purging is churn with no privacy benefit.
    await seed(GLOBAL_CACHE_CHARACTER_ID, 'type:587');
    await seed(GLOBAL_CACHE_CHARACTER_ID, 'name:1000035');
    await seed(GLOBAL_CACHE_CHARACTER_ID, 'station:60003760');
    await seed(CHAR_ID, 'wallet:balance');

    await purgeCharacterCache(CHAR_ID);

    expect((await keysFor(GLOBAL_CACHE_CHARACTER_ID)).sort()).toEqual([
      'name:1000035',
      'station:60003760',
      'type:587',
    ]);
  });

  it('leaves adjacent character ids untouched (compound-index range bounds)', async () => {
    await seed(NEIGHBOUR_BELOW, 'wallet:balance');
    await seed(CHAR_ID, 'wallet:balance');
    await seed(NEIGHBOUR_ABOVE, 'wallet:balance');

    await purgeCharacterCache(CHAR_ID);

    expect(await keysFor(NEIGHBOUR_BELOW)).toEqual(['wallet:balance']);
    expect(await keysFor(NEIGHBOUR_ABOVE)).toEqual(['wallet:balance']);
    expect(await keysFor(CHAR_ID)).toEqual([]);
  });

  it('refuses to purge the global sentinel itself', async () => {
    await seed(GLOBAL_CACHE_CHARACTER_ID, 'type:587');

    const deleted = await purgeCharacterCache(GLOBAL_CACHE_CHARACTER_ID);

    expect(deleted).toBe(0);
    expect(await keysFor(GLOBAL_CACHE_CHARACTER_ID)).toEqual(['type:587']);
  });

  it('is a no-op for a character with nothing cached', async () => {
    await expect(purgeCharacterCache(12345)).resolves.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Escalating fallback: a failing purge must never fail login or a token
// refresh, and must never leave the previous owner's rows readable.
// ---------------------------------------------------------------------------

function throwing(message: string): () => never {
  return () => {
    throw new Error(message);
  };
}

describe('purgeCharacterCacheOrSuppress', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await clearCachePurgePending(CHAR_ID);
    await clearCachePurgePending(NEIGHBOUR_ABOVE);
  });

  it('tier 1: the targeted purge succeeds, global rows survive, nothing is suppressed', async () => {
    await seed(CHAR_ID, 'wallet:balance');
    await seed(GLOBAL_CACHE_CHARACTER_ID, 'type:587');

    await expect(purgeCharacterCacheOrSuppress(CHAR_ID)).resolves.toBe('targeted');

    expect(await keysFor(CHAR_ID)).toEqual([]);
    expect(await keysFor(GLOBAL_CACHE_CHARACTER_ID)).toEqual(['type:587']);
    expect(await isCachePurgePending(CHAR_ID)).toBe(false);
  });

  it('tier 2: escalates to clearing the WHOLE table when the targeted range delete fails', async () => {
    // A damaged compound index fails the range delete but not a table clear.
    await seed(CHAR_ID, 'wallet:balance');
    await seed(NEIGHBOUR_ABOVE, 'wallet:balance');
    await seed(GLOBAL_CACHE_CHARACTER_ID, 'type:587');
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(throwing('index damaged'));

    await expect(purgeCharacterCacheOrSuppress(CHAR_ID)).resolves.toBe('full');
    where.mockRestore();

    expect(await db.esiCache.toArray()).toEqual([]);
    expect(await isCachePurgePending(CHAR_ID)).toBe(false);
  });

  it('tier 3: BOTH purges fail — resolves without throwing and suppresses the cache', async () => {
    await seed(CHAR_ID, 'wallet:balance');
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(throwing('index damaged'));
    const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));

    await expect(purgeCharacterCacheOrSuppress(CHAR_ID)).resolves.toBe('suppressed');
    where.mockRestore();
    clear.mockRestore();

    // The row is still on disk — we could not delete it. It must never be read.
    expect(await keysFor(CHAR_ID)).toEqual(['wallet:balance']);
    expect(await isCachePurgePending(CHAR_ID)).toBe(true);
  });

  it('tier 3 records a DEVICE-only durable marker, never a synced one', async () => {
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(throwing('index damaged'));
    const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));

    await purgeCharacterCacheOrSuppress(CHAR_ID);
    where.mockRestore();
    clear.mockRestore();

    const key = `${CACHE_PURGE_PENDING_PREFIX}${CHAR_ID}`;
    expect((await db.settings.get(key))?.value).toBe(true);
    // Device state: a stuck purge on THIS device must not suppress the cache
    // on every other device (sync/planSync only pushes 'sync.'-prefixed keys).
    expect(key.startsWith('sync.')).toBe(false);
  });

  it('tier 3 still suppresses in memory when the durable marker write ALSO fails', async () => {
    // Origin-wide quota exhaustion fails every readwrite transaction, the
    // settings write included. The in-memory set is what holds the line.
    await seed(CHAR_ID, 'wallet:balance');
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(throwing('index damaged'));
    const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));
    const put = vi.spyOn(db.settings, 'put').mockRejectedValue(new Error('QuotaExceeded'));

    await expect(purgeCharacterCacheOrSuppress(CHAR_ID)).resolves.toBe('suppressed');
    where.mockRestore();
    clear.mockRestore();
    put.mockRestore();

    expect(await isCachePurgePending(CHAR_ID)).toBe(true);
    expect(await db.settings.get(`${CACHE_PURGE_PENDING_PREFIX}${CHAR_ID}`)).toBeUndefined();
  });

  it('retries on the next call and clears the marker once a purge finally succeeds', async () => {
    await seed(CHAR_ID, 'wallet:balance');
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(throwing('index damaged'));
    const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));
    await purgeCharacterCacheOrSuppress(CHAR_ID);
    where.mockRestore();
    clear.mockRestore();
    expect(await isCachePurgePending(CHAR_ID)).toBe(true);

    await expect(purgeCharacterCacheOrSuppress(CHAR_ID)).resolves.toBe('targeted');

    expect(await isCachePurgePending(CHAR_ID)).toBe(false);
    expect(await db.settings.get(`${CACHE_PURGE_PENDING_PREFIX}${CHAR_ID}`)).toBeUndefined();
    expect(await keysFor(CHAR_ID)).toEqual([]);
  });

  it('suppresses only the failing character, not its neighbours', async () => {
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(throwing('index damaged'));
    const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));

    await purgeCharacterCacheOrSuppress(CHAR_ID);
    where.mockRestore();
    clear.mockRestore();

    expect(await isCachePurgePending(NEIGHBOUR_ABOVE)).toBe(false);
    expect(await isCachePurgePending(GLOBAL_CACHE_CHARACTER_ID)).toBe(false);
  });

  it('is a no-op for the global sentinel and never suppresses it', async () => {
    await seed(GLOBAL_CACHE_CHARACTER_ID, 'type:587');

    await expect(purgeCharacterCacheOrSuppress(GLOBAL_CACHE_CHARACTER_ID)).resolves.toBe(
      'targeted'
    );

    expect(await keysFor(GLOBAL_CACHE_CHARACTER_ID)).toEqual(['type:587']);
    expect(await isCachePurgePending(GLOBAL_CACHE_CHARACTER_ID)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Corp change (issue #293). Leaving a corporation revokes consent for that
// corporation's rows and nothing else — a pilot who changes corp keeps their
// own skills, mail and wallet.
// ---------------------------------------------------------------------------

describe('purgeCorpScopedCache', () => {
  const CORP_A = 98000001;
  const CORP_B = 98000002;

  it('deletes the corp-scoped rows and leaves every character-scoped row intact', async () => {
    await seed(CHAR_ID, corpCacheKey(CORP_A, 'structures'));
    await seed(CHAR_ID, corpCacheKey(CORP_A, 'wallets'));
    await seed(CHAR_ID, 'skills');
    await seed(CHAR_ID, 'wallet:balance');
    // Real key from features/character/employmentHistory.ts, plus a synthetic
    // probe of the range's upper bound: ':' sorts below every letter, so a key
    // merely *starting* with "corp" must fall outside `corp:`..`corp:￿`.
    await seed(CHAR_ID, 'employment-history');
    await seed(CHAR_ID, 'corporation-history');

    const deleted = await purgeCorpScopedCache(CHAR_ID);

    expect(deleted).toBe(2);
    expect(await keysFor(CHAR_ID)).toEqual([
      'corporation-history',
      'employment-history',
      'skills',
      'wallet:balance',
    ]);
  });

  it('deletes rows for every corporation the character holds, not just one', async () => {
    // A pilot who has been round the block: A -> B -> A leaves rows under both.
    await seed(CHAR_ID, corpCacheKey(CORP_A, 'structures'));
    await seed(CHAR_ID, corpCacheKey(CORP_B, 'structures'));
    await seed(CHAR_ID, 'skills');

    await purgeCorpScopedCache(CHAR_ID);

    expect(await keysFor(CHAR_ID)).toEqual(['skills']);
  });

  it('leaves ANOTHER character corp rows alone, even for the same corporation', async () => {
    await seed(NEIGHBOUR_BELOW, corpCacheKey(CORP_A, 'structures'));
    await seed(CHAR_ID, corpCacheKey(CORP_A, 'structures'));
    await seed(NEIGHBOUR_ABOVE, corpCacheKey(CORP_A, 'structures'));

    await purgeCorpScopedCache(CHAR_ID);

    expect(await keysFor(NEIGHBOUR_BELOW)).toEqual([corpCacheKey(CORP_A, 'structures')]);
    expect(await keysFor(NEIGHBOUR_ABOVE)).toEqual([corpCacheKey(CORP_A, 'structures')]);
    expect(await keysFor(CHAR_ID)).toEqual([]);
  });

  it('spares GLOBAL_CACHE_CHARACTER_ID rows', async () => {
    await seed(GLOBAL_CACHE_CHARACTER_ID, 'type:587');
    await seed(CHAR_ID, corpCacheKey(CORP_A, 'structures'));

    await purgeCorpScopedCache(CHAR_ID);

    expect(await keysFor(GLOBAL_CACHE_CHARACTER_ID)).toEqual(['type:587']);
  });

  it('refuses to purge the global sentinel itself', async () => {
    await seed(GLOBAL_CACHE_CHARACTER_ID, corpCacheKey(CORP_A, 'structures'));

    await expect(purgeCorpScopedCache(GLOBAL_CACHE_CHARACTER_ID)).resolves.toBe(0);

    expect(await keysFor(GLOBAL_CACHE_CHARACTER_ID)).toEqual([corpCacheKey(CORP_A, 'structures')]);
  });

  it('is a no-op for a character with no corp rows cached', async () => {
    await seed(CHAR_ID, 'skills');

    await expect(purgeCorpScopedCache(CHAR_ID)).resolves.toBe(0);

    expect(await keysFor(CHAR_ID)).toEqual(['skills']);
  });
});
