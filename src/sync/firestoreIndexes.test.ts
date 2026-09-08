import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Drift guard over `firestore.indexes.json` — **not** a proof that Firestore
 * honours the exemptions (issue #583's AC1). It cannot be: the Firestore
 * emulator "does not track compound indexes and instead will execute any
 * valid query", so no local run can observe an index being absent. What this
 * file does check is that the config still says what the sync code needs it
 * to say — that every synced collection group is exempted from automatic
 * indexing with `ownerHash` re-enabled, and that the dispatcher's own
 * collections were left alone.
 */

interface SingleFieldIndex {
  order?: string;
  arrayConfig?: string;
  queryScope: string;
}

interface FieldOverride {
  collectionGroup: string;
  fieldPath: string;
  ttl: boolean;
  indexes: SingleFieldIndex[];
}

interface CompositeIndex {
  collectionGroup: string;
  queryScope: string;
  fields: { fieldPath: string; order: string }[];
}

const config = JSON.parse(
  readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8')
) as { indexes: CompositeIndex[]; fieldOverrides: FieldOverride[] };

/**
 * The client-written collection groups, all read by exactly one query shape:
 * `where('ownerHash','==',h)`, optionally with `where('updatedAt','>',since)`
 * — `fetchOwnedDocs`/`pullOwnedDocs` in planSync.ts, plus the synced settings
 * read. Hardcoded rather than imported because the specs that carry these
 * names are module-private, and issue #583 is a config-only ticket.
 */
const SYNCED_COLLECTION_GROUPS = [
  'plans',
  'buildPlans',
  'quickbars',
  'stationPins',
  'planetRichness',
  'payees',
  'miningTaxAssignments',
  'notificationFeed',
  'productionRuns',
  'productionSaleLinks',
  'productionOrderWatches',
  'settings',
];

/** Written and queried by `functions/src/index.ts`, on fields of its own. */
const DISPATCHER_COLLECTION_GROUPS = ['projections', 'deviceRegistrations'];

const overridesFor = (collectionGroup: string) =>
  config.fieldOverrides.filter((o) => o.collectionGroup === collectionGroup);

describe('firestore.indexes.json field overrides', () => {
  it.each(SYNCED_COLLECTION_GROUPS)('exempts every field of %s from auto-indexing', (group) => {
    const wildcard = overridesFor(group).find((o) => o.fieldPath === '*');
    expect(wildcard).toEqual({
      collectionGroup: group,
      fieldPath: '*',
      ttl: false,
      indexes: [],
    });
  });

  it.each(SYNCED_COLLECTION_GROUPS)('re-enables the ownerHash index on %s', (group) => {
    // The one field any of these is ever filtered on. Ascending only: the
    // query is an equality, and `updatedAt` rides the composite indexes
    // below rather than a single-field one.
    const ownerHash = overridesFor(group).find((o) => o.fieldPath === 'ownerHash');
    expect(ownerHash).toEqual({
      collectionGroup: group,
      fieldPath: 'ownerHash',
      ttl: false,
      indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION' }],
    });
  });

  it('exempts nothing beyond those two fields per synced collection group', () => {
    const unexpected = config.fieldOverrides.filter(
      (o) => !SYNCED_COLLECTION_GROUPS.includes(o.collectionGroup)
    );
    expect(unexpected).toEqual([]);
    for (const group of SYNCED_COLLECTION_GROUPS) {
      expect(
        overridesFor(group)
          .map((o) => o.fieldPath)
          .sort()
      ).toEqual(['*', 'ownerHash']);
    }
  });

  it.each(DISPATCHER_COLLECTION_GROUPS)('leaves %s automatically indexed', (group) => {
    // These are queried on characterId, fired, fireAt, firedAt and
    // characterIds (array-contains) — an exemption here would break the
    // scheduled dispatcher, not just a sync pass.
    expect(overridesFor(group)).toEqual([]);
  });
});

describe('firestore.indexes.json composite indexes', () => {
  it('keeps the dispatcher projections indexes', () => {
    const projections = config.indexes.filter((i) => i.collectionGroup === 'projections');
    expect(projections).toEqual([
      {
        collectionGroup: 'projections',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'fired', order: 'ASCENDING' },
          { fieldPath: 'fireAt', order: 'ASCENDING' },
        ],
      },
      {
        collectionGroup: 'projections',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'fired', order: 'ASCENDING' },
          { fieldPath: 'firedAt', order: 'ASCENDING' },
        ],
      },
    ]);
  });

  it('keeps an ownerHash+updatedAt index for every incrementally pulled collection', () => {
    // A single-field exemption does not touch a composite index ("A field
    // exempted from automatic indexing can still be indexed as part of a
    // manual index"), so the incremental pull's `updatedAt` filter keeps
    // working without a single-field `updatedAt` entry above. Settings is
    // deliberately a full read and has no composite index.
    const incremental = SYNCED_COLLECTION_GROUPS.filter((g) => g !== 'settings');
    for (const group of incremental) {
      expect(config.indexes).toContainEqual({
        collectionGroup: group,
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'ownerHash', order: 'ASCENDING' },
          { fieldPath: 'updatedAt', order: 'ASCENDING' },
        ],
      });
    }
  });
});
