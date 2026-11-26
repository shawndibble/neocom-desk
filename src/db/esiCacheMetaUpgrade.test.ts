import { describe, it, expect, vi } from 'vitest';
import Dexie from 'dexie';

describe('adding esiCacheMeta to an existing database', () => {
  it('opens without backfilling meta and leaves every cached value intact', async () => {
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
