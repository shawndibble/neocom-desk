import { describe, it, expect, vi, afterEach } from 'vitest';
import Dexie from 'dexie';

/**
 * Every shipped schema version, as the stores each one *changed* (`null` drops
 * a table). Kept here as its own copy of history, so the test stays valid
 * whatever shape `./index.ts` declares its versions in.
 */
const HISTORY: [number, Record<string, string | null>][] = [
  [1, { characters: 'characterId', tokens: 'characterId', settings: 'key' }],
  [2, { skillPlans: 'id, characterId', esiCache: '[characterId+key]' }],
  [3, { buildPlans: 'id, characterId' }],
  [4, { quickbars: 'id, characterId' }],
  [5, { stationPins: 'id, characterId, locationId' }],
  [6, { notificationFeed: 'id, characterId, firedAt' }],
  [7, { characters: 'characterId, corporationId' }],
  [8, { planetRichness: 'id, characterId, planetId' }],
  [
    9,
    {
      productionRuns: 'id, characterId, buildPlanId',
      productionSaleLinks: 'id, characterId, runId',
      productionOrderWatches: 'id, characterId, runId',
    },
  ],
  [
    10,
    {
      payees: 'id, characterId',
      miningTaxAssignments: 'id, characterId, [characterId+date+solarSystemId]',
    },
  ],
  [11, { bpcSearchWatches: 'id' }],
  [12, { orderProblemSamples: 'orderId, characterId' }],
  [13, { mailDrafts: 'id, characterId' }],
  [14, { miningLedgerHistory: 'characterId' }],
  [15, { jitaPriceSnapshots: 'date' }],
  [16, { bpcSearchWatches: null }],
  [17, { fittings: 'id, characterId' }],
  [18, { hullFitCache: 'key, savedAt' }],
  [19, { esiCacheMeta: '[characterId+key]' }],
  [20, { ansiblexGates: 'id' }],
  [21, { industryJobHistory: 'characterId' }],
  [22, { netWorthSnapshots: 'id, characterId' }],
  [23, { productionLosses: 'id, characterId, runId' }],
  [
    24,
    {
      walletJournalArchive: '[characterId+id], characterId, [characterId+date]',
      walletTransactionArchive: '[characterId+transaction_id], characterId, [characterId+date]',
      walletArchiveCoverage: '[characterId+kind], characterId',
    },
  ],
  [25, { dynamicItems: 'itemId' }],
  [26, { corpMailQueue: 'id, corporationId, batchId, senderCharacterId' }],
  [27, { jitaPriceSnapshots: null }],
];

/** The complete schema at `version`: every delta up to it, drops removed. */
function schemaAt(version: number): Record<string, string> {
  const stores: Record<string, string | null> = {};
  for (const [v, delta] of HISTORY) if (v <= version) Object.assign(stores, delta);
  return Object.fromEntries(
    Object.entries(stores).filter((e): e is [string, string] => e[1] !== null)
  );
}

const splitKeyPaths = (spec: string) =>
  spec
    .split(',')
    .map((s) => s.trim().replace(/^[&*]|\+\+/g, ''))
    .filter(Boolean);

const FIELD_VALUES: Record<string, unknown> = {
  key: 'k',
  kind: 'journal',
  date: '2026-01-01',
  id: 7,
  transaction_id: 8,
};

/**
 * One row for `table`, carrying a value at every key path the *latest* schema
 * indexes — so a row written under an old version is still reachable through
 * an index the upgrade adds later.
 */
function rowFor(table: string, latest: Record<string, string>): Record<string, unknown> {
  const row: Record<string, unknown> = { payload: `${table}-payload` };
  for (const path of splitKeyPaths(latest[table]).flatMap((p) =>
    p.replace(/[[\]]/g, '').split('+')
  )) {
    row[path] = FIELD_VALUES[path] ?? 1;
  }
  return row;
}

afterEach(async () => {
  await Dexie.delete('neocom');
});

describe('opening the current database over every historical version', () => {
  const latestVersion = HISTORY[HISTORY.length - 1][0];
  const latest = schemaAt(latestVersion);

  it.each(HISTORY.map(([v]) => v))('keeps every row and index from v%i', async (version) => {
    const old = new Dexie('neocom');
    old.version(version).stores(schemaAt(version));
    const written = schemaAt(version);
    for (const table of Object.keys(written)) {
      await old.table(table).add(rowFor(table, { ...written, ...latest }));
    }
    old.close();

    vi.resetModules();
    const { db } = await import('./index');
    await db.open();

    expect(db.verno).toBe(latestVersion);
    // The schema matches the history exactly: no table lost, none left over.
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(latest).sort());
    for (const [name, spec] of Object.entries(latest)) {
      const [primary, ...indexes] = spec.split(',').map((s) => s.trim());
      const { schema } = db.table(name);
      expect(schema.primKey.src, `${name} primary key`).toBe(primary);
      expect(schema.indexes.map((i) => i.src).sort(), `${name} indexes`).toEqual(
        [...indexes].sort()
      );
    }

    for (const name of Object.keys(written)) {
      if (!(name in latest)) continue; // dropped by a later version on purpose
      const table = db.table(name);
      const expected = rowFor(name, latest);
      expect(await table.count(), `${name} row count`).toBe(1);
      expect(await table.toArray(), `${name} rows`).toEqual([expected]);
      // Every index the code can query finds the row.
      for (const index of table.schema.indexes) {
        const value = index.compound
          ? (index.keyPath as string[]).map((p) => expected[p])
          : expected[index.keyPath as string];
        expect(
          await table
            .where(index.name)
            .equals(value as never)
            .count(),
          `${name}.${index.name}`
        ).toBe(1);
      }
    }
    db.close();
  });
});
