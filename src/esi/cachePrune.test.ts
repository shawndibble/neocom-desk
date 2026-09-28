/**
 * Age-based pruning of per-id `esiCache` rows (cachePrune.ts).
 *
 * What these pin: only allowlisted per-id keys are ever deleted, only once
 * they are older than their rule's window, never a row refreshed between the
 * scan and the delete, and never by deserializing a cached value just to
 * learn its age.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import {
  MARKET_RETENTION_MS,
  PRUNE_FIRST_RUN_KEY,
  PRUNE_LAST_RUN_KEY,
  PRUNE_MIN_INTERVAL_MS,
  STATIC_RETENTION_MS,
  pruneEsiCache,
  pruneRuleFor,
  runDailyEsiCachePrune,
} from './cachePrune';
import { GLOBAL_CACHE_CHARACTER_ID } from './cache';

const CHAR = 91;
const G = GLOBAL_CACHE_CHARACTER_ID;
const DAY = 24 * 60 * 60_000;
const NOW = 1_000 * DAY;

async function seed(characterId: number, key: string, fetchedAt: number, value: unknown = 'v') {
  await db.esiCache.put({ characterId, key, value, fetchedAt });
}

/** A row written before `esiCacheMeta` existed: value present, meta absent. */
async function seedWithoutMeta(characterId: number, key: string, fetchedAt: number) {
  await seed(characterId, key, fetchedAt);
  await db.esiCacheMeta.delete([characterId, key]);
}

async function keys(): Promise<string[]> {
  return (await db.esiCache.toCollection().primaryKeys()).map(([c, k]) => `${c}|${k}`).sort();
}

beforeEach(async () => {
  await db.esiCache.clear();
  await db.settings.delete(PRUNE_LAST_RUN_KEY);
  await db.settings.delete(PRUNE_FIRST_RUN_KEY);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pruneRuleFor', () => {
  it.each([
    'name:123',
    'type:34',
    'group:18',
    'affiliation:9000',
    'public-character:9000',
    'public-corporation:98000001',
    'public-alliance:99000001',
    'public-employment:9000',
    'structure:1035466617946',
    'structure:1035466617946:forbidden',
    'structure:1035466617946:roster-forbidden',
    'station:60003760',
    'system:30000142',
    'route:30000142:30002187:shortest',
    'universeType:34',
    'type-volume:34',
    'corp-name:1000035',
    'loyalty-store-offers:1000035',
    'bpc-region:10000002',
    'bpc-blueprint-location:v2:60003760',
    'contract-location:60003760',
    'public-contract-items:200000001',
  ])('%s is a static-tier per-id key', (key) => {
    expect(pruneRuleFor(key)?.maxAgeMs).toBe(STATIC_RETENTION_MS);
  });

  it.each([
    'marketPrice:60003760:34',
    'marketPrice:adjusted',
    'market-history:10000002:34',
    'structure-market:1035466617946',
    'marketHistory:2026-09-01:2026-09-28',
  ])('%s is a market-tier per-id key', (key) => {
    expect(pruneRuleFor(key)?.maxAgeMs).toBe(MARKET_RETENTION_MS);
  });

  it.each(['mail:12345', 'calendar:777', 'contract-items:200000001'])(
    '%s is pruned only once its list no longer references it',
    (key) => {
      expect(pruneRuleFor(key)?.referencedBy).toBeDefined();
    }
  );

  it.each([
    // Single-row-per-character keys: the user's main data, never age-pruned.
    'skills',
    'wallet',
    'assets',
    'contracts',
    'calendar',
    'calendar:seen',
    'mail:headers',
    'mail:labels',
    'mail:lists',
    // Corp-owned rows have their own purge path.
    'corp:98000001:structures',
    'corp:98000001:name:1',
    // PI rows are read cache-only by the alt-colony view; bounded by colonies.
    'planet:40000001',
    'planet-info:40000001',
    'schematic:66',
    // Near misses of allowlisted prefixes.
    'name:abc',
    'names:1',
    'type:34:extra',
    'structure:1:other',
    'nametag:1',
  ])('%s is never pruned', (key) => {
    expect(pruneRuleFor(key)).toBeUndefined();
  });
});

describe('pruneEsiCache', () => {
  it('deletes per-id rows older than their window and keeps younger ones', async () => {
    await seed(G, 'name:1', NOW - STATIC_RETENTION_MS - 1);
    await seed(G, 'name:2', NOW - STATIC_RETENTION_MS + DAY);
    await seed(G, 'marketPrice:60003760:34', NOW - MARKET_RETENTION_MS - 1);
    await seed(G, 'marketPrice:60003760:35', NOW - MARKET_RETENTION_MS + DAY);
    await seed(CHAR, 'structure:5:forbidden', NOW - STATIC_RETENTION_MS - 1);

    const deleted = await pruneEsiCache({ now: NOW });

    expect(deleted).toBe(3);
    expect(await keys()).toEqual([`${G}|marketPrice:60003760:35`, `${G}|name:2`]);
  });

  it('mirrors the deletes onto esiCacheMeta', async () => {
    await seed(G, 'name:1', NOW - STATIC_RETENTION_MS - 1);

    await pruneEsiCache({ now: NOW });

    expect(await db.esiCacheMeta.get([G, 'name:1'])).toBeUndefined();
  });

  it('never deletes single-row-per-character keys, however old', async () => {
    const ancient = NOW - 900 * DAY;
    for (const key of ['skills', 'wallet', 'assets', 'mail:headers', 'calendar:seen', 'planet:4']) {
      await seed(CHAR, key, ancient);
    }

    expect(await pruneEsiCache({ now: NOW })).toBe(0);
    expect(await keys()).toHaveLength(6);
  });

  it('never deserializes a cached value to decide', async () => {
    await seed(G, 'name:1', NOW - STATIC_RETENTION_MS - 1);
    await seed(G, 'name:2', NOW);
    const get = vi.spyOn(db.esiCache, 'get');
    const bulkGet = vi.spyOn(db.esiCache, 'bulkGet');
    const toArray = vi.spyOn(db.esiCache, 'toArray');

    await pruneEsiCache({ now: NOW });

    expect(get).not.toHaveBeenCalled();
    expect(bulkGet).not.toHaveBeenCalled();
    expect(toArray).not.toHaveBeenCalled();
  });

  it('keeps a row that was refreshed between the scan and its delete', async () => {
    await seed(G, 'name:1', NOW - STATIC_RETENTION_MS - 1);
    await seed(G, 'name:2', NOW - STATIC_RETENTION_MS - 1);

    // The refresh lands in the gap before the first delete chunk.
    const deleted = await pruneEsiCache({
      now: NOW,
      beforeChunk: () => seed(G, 'name:1', NOW, 'fresh'),
    });

    expect(deleted).toBe(1);
    expect((await db.esiCache.get([G, 'name:1']))?.value).toBe('fresh');
    expect(await db.esiCache.get([G, 'name:2'])).toBeUndefined();
  });

  it('deletes in chunks, yielding between them', async () => {
    for (let i = 0; i < 5; i += 1) await seed(G, `name:${i}`, NOW - STATIC_RETENTION_MS - 1);
    const beforeChunk = vi.fn(async () => {});

    const deleted = await pruneEsiCache({ now: NOW, chunkSize: 2, beforeChunk });

    expect(deleted).toBe(5);
    expect(beforeChunk).toHaveBeenCalledTimes(3);
  });

  it('scans meta across page boundaries', async () => {
    for (let i = 0; i < 7; i += 1) await seed(G, `name:${i}`, NOW - STATIC_RETENTION_MS - 1);
    await seed(G, 'skills', NOW - 900 * DAY);

    expect(await pruneEsiCache({ now: NOW, scanPageSize: 3 })).toBe(7);
    expect(await keys()).toEqual([`${G}|skills`]);
  });

  describe('referenced rows', () => {
    const old = NOW - STATIC_RETENTION_MS - 1;

    it('keeps an old mail body whose mail is still in the cached header list', async () => {
      await seed(CHAR, 'mail:headers', NOW, [{ mail_id: 1 }]);
      await seed(CHAR, 'mail:1', old);
      await seed(CHAR, 'mail:2', old);

      await pruneEsiCache({ now: NOW });

      expect(await keys()).toEqual([`${CHAR}|mail:1`, `${CHAR}|mail:headers`]);
    });

    it('checks references per character', async () => {
      await seed(CHAR, 'mail:headers', NOW, [{ mail_id: 1 }]);
      await seed(CHAR + 1, 'mail:headers', NOW, []);
      await seed(CHAR + 1, 'mail:1', old);

      await pruneEsiCache({ now: NOW });

      expect(await db.esiCache.get([CHAR + 1, 'mail:1'])).toBeUndefined();
    });

    it('keeps an event detail listed in either calendar row', async () => {
      await seed(CHAR, 'calendar', NOW, [{ event_id: 1 }]);
      await seed(CHAR, 'calendar:seen', NOW, [{ event_id: 2 }]);
      for (const id of [1, 2, 3]) await seed(CHAR, `calendar:${id}`, old);

      await pruneEsiCache({ now: NOW });

      expect(await db.esiCache.get([CHAR, 'calendar:1'])).toBeDefined();
      expect(await db.esiCache.get([CHAR, 'calendar:2'])).toBeDefined();
      expect(await db.esiCache.get([CHAR, 'calendar:3'])).toBeUndefined();
    });

    it('keeps contract items for a contract still in the contract list', async () => {
      await seed(CHAR, 'contracts', NOW, [{ contract_id: 10 }]);
      await seed(CHAR, 'contract-items:10', old);
      await seed(CHAR, 'contract-items:11', old);

      await pruneEsiCache({ now: NOW });

      expect(await db.esiCache.get([CHAR, 'contract-items:10'])).toBeDefined();
      expect(await db.esiCache.get([CHAR, 'contract-items:11'])).toBeUndefined();
    });
  });

  describe('rows without meta (written before esiCacheMeta existed)', () => {
    it('are skipped until the first run is older than the window', async () => {
      await seedWithoutMeta(G, 'name:1', 0);

      expect(await pruneEsiCache({ now: NOW, firstRunAt: NOW - STATIC_RETENTION_MS + DAY })).toBe(
        0
      );
      expect(await pruneEsiCache({ now: NOW })).toBe(0);
      expect(await keys()).toEqual([`${G}|name:1`]);
    });

    it('are pruned by key alone once the first run is older than the window', async () => {
      await seedWithoutMeta(G, 'name:1', 0);
      await seedWithoutMeta(G, 'skills', 0);
      await seedWithoutMeta(G, 'marketPrice:1:2', 0);
      const firstRunAt = NOW - MARKET_RETENTION_MS - 1;

      // Old enough for the market window, not yet for the static one.
      expect(await pruneEsiCache({ now: NOW, firstRunAt })).toBe(1);
      expect(await keys()).toEqual([`${G}|name:1`, `${G}|skills`]);
    });

    it('are judged by their meta if a read backfilled it meanwhile', async () => {
      await seedWithoutMeta(G, 'name:1', 0);

      const deleted = await pruneEsiCache({
        now: NOW,
        firstRunAt: NOW - STATIC_RETENTION_MS - 1,
        beforeChunk: () => db.esiCacheMeta.put({ characterId: G, key: 'name:1', fetchedAt: NOW }),
      });

      expect(deleted).toBe(0);
    });
  });
});

describe('runDailyEsiCachePrune', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('prunes, stamps the run, and records the first run once', async () => {
    await seed(G, 'name:1', NOW - STATIC_RETENTION_MS - 1);

    expect(await runDailyEsiCachePrune()).toBe(1);
    expect((await db.settings.get(PRUNE_LAST_RUN_KEY))?.value).toBe(NOW);
    expect((await db.settings.get(PRUNE_FIRST_RUN_KEY))?.value).toBe(NOW);

    vi.spyOn(Date, 'now').mockReturnValue(NOW + PRUNE_MIN_INTERVAL_MS + 1);
    await runDailyEsiCachePrune();
    expect((await db.settings.get(PRUNE_FIRST_RUN_KEY))?.value).toBe(NOW);
  });

  it('runs at most once per interval', async () => {
    await db.settings.put({ key: PRUNE_LAST_RUN_KEY, value: NOW - PRUNE_MIN_INTERVAL_MS + 1 });
    await seed(G, 'name:1', NOW - STATIC_RETENTION_MS - 1);

    expect(await runDailyEsiCachePrune()).toBeNull();
    expect(await keys()).toHaveLength(1);
  });

  it('lets only one of two concurrent callers run', async () => {
    const results = await Promise.all([runDailyEsiCachePrune(), runDailyEsiCachePrune()]);

    expect(results.filter((r) => r === null)).toHaveLength(1);
  });

  it('does not run offline, where a pruned row could not be refetched', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    await seed(G, 'name:1', NOW - STATIC_RETENTION_MS - 1);

    expect(await runDailyEsiCachePrune()).toBeNull();
    expect(await keys()).toHaveLength(1);
    expect(await db.settings.get(PRUNE_LAST_RUN_KEY)).toBeUndefined();
  });

  it('applies the meta-less rule from the persisted first run', async () => {
    await db.settings.put({ key: PRUNE_FIRST_RUN_KEY, value: NOW - STATIC_RETENTION_MS - 1 });
    await seedWithoutMeta(G, 'name:1', 0);

    expect(await runDailyEsiCachePrune()).toBe(1);
  });
});
