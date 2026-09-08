import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REMOTE_COLLECTIONS } from './characterPurge';

/**
 * Drift guard over `firestore.indexes.json` — **not** a proof that Firestore
 * honours the exemptions (issue #583's AC1). It cannot be: the Firestore
 * emulator "does not track compound indexes and instead will execute any
 * valid query", so nothing run locally can observe an index being absent.
 *
 * What it does check is that the config still covers what the sync code
 * needs, and that it keeps covering it. `REMOTE_COLLECTIONS` is the
 * authoritative list of remotely-owned collections, so a 13th one added
 * there fails this file until it is exempted too — the case the wildcard
 * design exists to survive, and the one a list hardcoded here would sail
 * straight past.
 */

interface SingleFieldIndex {
  order: string;
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

/** Written and queried by `functions/src/index.ts`, on fields of its own. */
const DISPATCHER_COLLECTION_GROUPS = ['projections', 'deviceRegistrations'];

const overridesFor = (collectionGroup: string) =>
  config.fieldOverrides.filter((o) => o.collectionGroup === collectionGroup);

describe('firestore.indexes.json field overrides', () => {
  it.each(REMOTE_COLLECTIONS)('exempts every field of %s from auto-indexing', (group) => {
    expect(overridesFor(group)).toContainEqual({
      collectionGroup: group,
      fieldPath: '*',
      ttl: false,
      indexes: [],
    });
  });

  it.each(REMOTE_COLLECTIONS)('re-enables the ownerHash index on %s', (group) => {
    // The one field any of these is ever filtered on. Ascending only: the
    // query is an equality, and `updatedAt` rides a composite index rather
    // than a single-field one — an exemption applies only to *automatic*
    // indexing, so a manual composite index still covers its own fields.
    expect(overridesFor(group)).toContainEqual({
      collectionGroup: group,
      fieldPath: 'ownerHash',
      ttl: false,
      indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION' }],
    });
  });

  it.each(REMOTE_COLLECTIONS)('exempts nothing else on %s', (group) => {
    expect(
      overridesFor(group)
        .map((o) => o.fieldPath)
        .sort()
    ).toEqual(['*', 'ownerHash']);
  });

  it('overrides nothing outside the remotely-owned collections', () => {
    const groups = new Set(REMOTE_COLLECTIONS as readonly string[]);
    expect(config.fieldOverrides.filter((o) => !groups.has(o.collectionGroup))).toEqual([]);
  });

  it.each(DISPATCHER_COLLECTION_GROUPS)('leaves %s automatically indexed', (group) => {
    // Queried on characterId, fired, fireAt, firedAt and characterIds
    // (array-contains). An exemption here would break the scheduled
    // dispatcher, not just a sync pass.
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
});
