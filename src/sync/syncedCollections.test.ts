import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ownerHashKey, tombstoneKey } from './localBookkeeping';
import type { RemoteDoc } from './merge';
import { FULL_RECORDS } from './syncedCollectionFixtures';
import {
  EDITABLE_COLLECTIONS,
  NOTIFICATION_FEED,
  REMOTE_COLLECTION_NAMES,
  REMOTE_COLLECTIONS,
  SYNCED_SETTINGS,
} from './syncedCollections';

/**
 * The registry is the one place a synced collection is declared, so these
 * pins are what stop a refactor of it from quietly changing something that
 * already lives on a pilot's device or in Firestore. Every literal below was
 * read off the code as it stood before the registry existed (issue #2043).
 */
describe('synced collection registry — persisted names', () => {
  it('declares exactly the remote collections already in Firestore', () => {
    expect([...REMOTE_COLLECTION_NAMES].sort()).toEqual([
      'buildPlans',
      'fittings',
      'miningTaxAssignments',
      'netWorthSnapshots',
      'notificationFeed',
      'payees',
      'planetRichness',
      'plans',
      'productionOrderWatches',
      'productionRuns',
      'productionSaleLinks',
      'quickbars',
      'settings',
      'stationPins',
    ]);
  });

  it('keeps the sync pass in its existing order', () => {
    // syncCharacter walks this list in order; one collection throwing stops
    // the pass, so the order is behavior, not presentation.
    expect(EDITABLE_COLLECTIONS.map((c) => c.remoteName)).toEqual([
      'plans',
      'buildPlans',
      'quickbars',
      'stationPins',
      'planetRichness',
      'productionRuns',
      'productionSaleLinks',
      'productionOrderWatches',
      'netWorthSnapshots',
      'payees',
      'fittings',
      'miningTaxAssignments',
    ]);
  });

  it('keeps every Dexie table name', () => {
    expect(Object.fromEntries(EDITABLE_COLLECTIONS.map((c) => [c.remoteName, c.table]))).toEqual({
      plans: 'skillPlans',
      buildPlans: 'buildPlans',
      quickbars: 'quickbars',
      stationPins: 'stationPins',
      planetRichness: 'planetRichness',
      productionRuns: 'productionRuns',
      productionSaleLinks: 'productionSaleLinks',
      productionOrderWatches: 'productionOrderWatches',
      netWorthSnapshots: 'netWorthSnapshots',
      payees: 'payees',
      fittings: 'fittings',
      miningTaxAssignments: 'miningTaxAssignments',
    });
  });

  it('keeps every tombstone key byte-identical, so tombstones already on a device are still honored', () => {
    expect(
      Object.fromEntries(EDITABLE_COLLECTIONS.map((c) => [c.remoteName, tombstoneKey(c, 7)]))
    ).toEqual({
      plans: 'sync.__tombstones.7',
      buildPlans: 'sync.__buildTombstones.7',
      quickbars: 'sync.__quickbarTombstones.7',
      stationPins: 'sync.__stationPinTombstones.7',
      planetRichness: 'sync.__planetRichnessTombstones.7',
      productionRuns: 'sync.__productionRunTombstones.7',
      productionSaleLinks: 'sync.__productionSaleLinkTombstones.7',
      productionOrderWatches: 'sync.__productionOrderWatchTombstones.7',
      netWorthSnapshots: 'sync.__netWorthSnapshotTombstones.7',
      payees: 'sync.__payeeTombstones.7',
      fittings: 'sync.__fittingTombstones.7',
      miningTaxAssignments: 'sync.__miningTaxAssignmentTombstones.7',
    });
    expect(ownerHashKey(7)).toBe('sync.__ownerHash.7');
  });

  it('deletes every collection’s local rows on Character removal, Production Log included', () => {
    expect(EDITABLE_COLLECTIONS.filter((c) => c.onRemoval === 'keep')).toEqual([]);
  });

  it('declares the feed and synced settings alongside the editable collections', () => {
    expect(REMOTE_COLLECTIONS).toContain(NOTIFICATION_FEED);
    expect(REMOTE_COLLECTIONS).toContain(SYNCED_SETTINGS);
    expect(NOTIFICATION_FEED.remoteName).toBe('notificationFeed');
    expect(SYNCED_SETTINGS.remoteName).toBe('settings');
  });
});

/**
 * The class of bug this pins: a field the UI writes onto a record that the
 * collection's remote mapping then forgets, so the value is saved locally
 * and quietly never leaves the device. A mapping lists its fields explicitly
 * — never a spread, because Firestore rejects `undefined` and a record can
 * carry local-only shapes — so nothing but a test can notice the omission.
 * `FULL_RECORDS` is typed `Required<...>`, so a new field fails typecheck
 * there until it is set, and then fails here until it is mapped.
 */
describe('every declared collection round-trips local -> remote -> local', () => {
  it('has a full-record fixture for every declared collection', () => {
    expect(Object.keys(FULL_RECORDS).sort()).toEqual(
      EDITABLE_COLLECTIONS.map((c) => c.table).sort()
    );
  });

  describe.each(EDITABLE_COLLECTIONS.map((c) => [c.remoteName, c] as const))('%s', (_name, c) => {
    const record = FULL_RECORDS[c.table as keyof typeof FULL_RECORDS];

    it('pushes every field, plus ownerHash and deleted: false', () => {
      const remote = c.toRemoteDoc(record, 'hash');
      // Key by key, so a dropped field fails naming itself.
      for (const [key, value] of Object.entries(record)) {
        expect({ [key]: remote[key] }).toEqual({ [key]: value });
      }
      expect(remote.ownerHash).toBe('hash');
      expect(remote.deleted).toBe(false);
    });

    it('pulls every field back, and strips the remote-only ones', () => {
      const remote = c.toRemoteDoc(record, 'hash');
      const local = c.toLocalRecord(remote as unknown as RemoteDoc);
      expect(local).toEqual(record);
    });
  });
});

/**
 * `firestore.rules` and `firestore.indexes.json` stay hand-written (they are
 * deployed by hand, and a generated rules file is a new trust surface). This
 * is the drift guard between them and the registry instead: a collection
 * declared without a rules block is denied on every write — and since
 * syncCharacter has no per-collection try/catch, one denied collection
 * fails the whole pass.
 */
describe('declared collections vs the hand-written Firestore config', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const CHARACTER_MATCH = 'match /characters/{uid} {';
  // Just the subcollections nested under characters/{uid}, not the
  // top-level collections the dispatcher and shared caches use.
  const characterBlock = rules.slice(
    rules.indexOf(CHARACTER_MATCH) + CHARACTER_MATCH.length,
    rules.indexOf('match /deviceRegistrations/')
  );
  const ruledSubcollections = [...characterBlock.matchAll(/match \/(\w+)\/\{\w+\} \{/g)].map(
    (m) => m[1]
  );

  const indexes = (
    JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8')) as {
      indexes: {
        collectionGroup: string;
        queryScope: string;
        fields: { fieldPath: string; order: string }[];
      }[];
    }
  ).indexes;

  it.each(REMOTE_COLLECTION_NAMES)('has a rules block for characters/{uid}/%s', (name) => {
    expect(ruledSubcollections).toContain(name);
  });

  it('has no rules block for a collection the registry does not declare', () => {
    expect([...ruledSubcollections].sort()).toEqual([...REMOTE_COLLECTION_NAMES].sort());
  });

  // Editable collections and the feed are read incrementally
  // (`ownerHash == h AND updatedAt > cursor`), which needs this composite.
  // Synced settings are deliberately read unwindowed and need none.
  it.each(REMOTE_COLLECTIONS.filter((c) => c.kind !== 'settings').map((c) => c.remoteName))(
    'has the incremental-pull composite index on %s',
    (name) => {
      expect(indexes).toContainEqual({
        collectionGroup: name,
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'ownerHash', order: 'ASCENDING' },
          { fieldPath: 'updatedAt', order: 'ASCENDING' },
        ],
      });
    }
  );

  it('has no composite index on synced settings', () => {
    expect(indexes.filter((i) => i.collectionGroup === SYNCED_SETTINGS.remoteName)).toEqual([]);
  });
});
