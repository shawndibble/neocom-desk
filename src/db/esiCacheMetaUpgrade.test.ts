import { describe, it, expect, vi } from 'vitest';
import Dexie from 'dexie';

/**
 * The version that adds `esiCacheMeta` must not walk `esiCache` in an
 * `upgrade()`: that would deserialize every cached value — megabytes of
 * assets and journal — inside the open, before first render. Meta for rows
 * that predate it is backfilled lazily by `esi/cache.ts` instead.
 */
describe('adding esiCacheMeta to an existing database', () => {
  it('opens without backfilling meta and leaves every cached value intact', async () => {
    // The v18 shape, as a returning user's browser has it.
    const old = new Dexie('neocom');
    old.version(18).stores({
      characters: 'characterId, corporationId',
      tokens: 'characterId',
      settings: 'key',
      skillPlans: 'id, characterId',
      esiCache: '[characterId+key]',
      buildPlans: 'id, characterId',
      quickbars: 'id, characterId',
      stationPins: 'id, characterId, locationId',
      planetRichness: 'id, characterId, planetId',
      notificationFeed: 'id, characterId, firedAt',
      productionRuns: 'id, characterId, buildPlanId',
      productionSaleLinks: 'id, characterId, runId',
      productionOrderWatches: 'id, characterId, runId',
      payees: 'id, characterId',
      miningTaxAssignments: 'id, characterId, [characterId+date+solarSystemId]',
      orderProblemSamples: 'orderId, characterId',
      mailDrafts: 'id, characterId',
      miningLedgerHistory: 'characterId',
      jitaPriceSnapshots: 'date',
      fittings: 'id, characterId',
      hullFitCache: 'key, savedAt',
    });
    await old.table('esiCache').bulkPut([
      { characterId: 1, key: 'assets', value: [1, 2, 3], fetchedAt: 10 },
      { characterId: 0, key: 'type:34', value: 'Tritanium', fetchedAt: 20 },
    ]);
    old.close();

    vi.resetModules();
    const { db } = await import('./index');
    await db.open();

    expect(await db.esiCacheMeta.count()).toBe(0);
    expect((await db.esiCache.get([1, 'assets']))?.value).toEqual([1, 2, 3]);
    expect(await db.esiCache.count()).toBe(2);
    db.close();
  });
});
