import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHARES_COLLECTION } from '@/features/share/shareStore';
import { REMOTE_COLLECTION_NAMES } from './syncedCollections';

const SWEEP_GROUP_FIELDS: [group: string, field: string][] = [
  ['feeders', 'status'],
  ['itemRequests', 'expiresAt'],
  ['itemRequests', 'closedAt'],
  ['fleetPayouts', 'expiresAt'],
  ['srpClaims', 'closedAt'],
  ['vettingReviews', 'expiresAt'],
  ['vettingThrottle', 'windowStart'],
];

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

const DISPATCHER_COLLECTION_GROUPS = ['projections', 'deviceRegistrations'];

const overridesFor = (collectionGroup: string) =>
  config.fieldOverrides.filter((o) => o.collectionGroup === collectionGroup);

const EXTRA_INDEXED_FIELDS: Partial<Record<string, readonly string[]>> = {
  notificationFeed: ['firedAt'],
  fittings: ['ownerUid'],
};

describe('firestore.indexes.json field overrides', () => {
  it.each(REMOTE_COLLECTION_NAMES)('exempts every field of %s from auto-indexing', (group) => {
    expect(overridesFor(group)).toContainEqual({
      collectionGroup: group,
      fieldPath: '*',
      ttl: false,
      indexes: [],
    });
  });

  it.each(REMOTE_COLLECTION_NAMES)('re-enables the ownerHash index on %s', (group) => {
    expect(overridesFor(group)).toContainEqual({
      collectionGroup: group,
      fieldPath: 'ownerHash',
      ttl: false,
      indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION' }],
    });
  });

  it.each(REMOTE_COLLECTION_NAMES)('exempts nothing else on %s', (group) => {
    expect(
      overridesFor(group)
        .map((o) => o.fieldPath)
        .sort()
    ).toEqual(['*', 'ownerHash', ...(EXTRA_INDEXED_FIELDS[group] ?? [])].sort());
  });

  it('re-enables firedAt on notificationFeed at collection-group scope', () => {
    expect(overridesFor('notificationFeed')).toContainEqual({
      collectionGroup: 'notificationFeed',
      fieldPath: 'firedAt',
      ttl: false,
      indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' }],
    });
  });

  it('overrides nothing outside the remotely-owned collections and shares', () => {
    const groups = new Set([
      ...REMOTE_COLLECTION_NAMES,
      SHARES_COLLECTION,
      'surveyScans',
      'surveyTax',
      'surveyIgnores',
      'surveyInfo',
      'systemConditions',
      'pledges',
      'miners',
      'feederObserved',
      'shortLinkLimits',
      ...SWEEP_GROUP_FIELDS.map(([group]) => group),
    ]);
    expect(config.fieldOverrides.filter((o) => !groups.has(o.collectionGroup))).toEqual([]);
  });

  it.each(SWEEP_GROUP_FIELDS)(
    'indexes %s.%s at collection-group scope, keeping the default collection indexes',
    (group, field) => {
      expect(overridesFor(group)).toContainEqual({
        collectionGroup: group,
        fieldPath: field,
        ttl: false,
        indexes: [
          { order: 'ASCENDING', queryScope: 'COLLECTION' },
          { order: 'DESCENDING', queryScope: 'COLLECTION' },
          { arrayConfig: 'CONTAINS', queryScope: 'COLLECTION' },
          { order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' },
        ],
      });
    }
  );

  it('indexes pending Miner groupings by character at collection-group scope', () => {
    expect(overridesFor('miners')).toEqual([
      {
        collectionGroup: 'miners',
        fieldPath: 'pendingConfirmation',
        ttl: false,
        indexes: [
          { arrayConfig: 'CONTAINS', queryScope: 'COLLECTION' },
          { arrayConfig: 'CONTAINS', queryScope: 'COLLECTION_GROUP' },
        ],
      },
    ]);
  });

  it('indexes pledges by communityId at collection and collection-group scope', () => {
    expect(overridesFor('pledges')).toEqual([
      {
        collectionGroup: 'pledges',
        fieldPath: 'communityId',
        ttl: false,
        indexes: [
          { order: 'ASCENDING', queryScope: 'COLLECTION' },
          { order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' },
        ],
      },
    ]);
  });

  it('indexes one Member’s own Pledges in a Community at collection-group scope', () => {
    expect(config.indexes).toContainEqual({
      collectionGroup: 'pledges',
      queryScope: 'COLLECTION_GROUP',
      fields: [
        { fieldPath: 'communityId', order: 'ASCENDING' },
        { fieldPath: 'ownerHash', order: 'ASCENDING' },
      ],
    });
  });

  it('expires shares by a TTL policy on expiresAt, and indexes none of their fields', () => {
    expect(overridesFor(SHARES_COLLECTION)).toEqual([
      { collectionGroup: SHARES_COLLECTION, fieldPath: '*', ttl: false, indexes: [] },
      { collectionGroup: SHARES_COLLECTION, fieldPath: 'expiresAt', ttl: true, indexes: [] },
    ]);
  });

  it('expires a Survey Scan with its survey, and indexes only createdAt, for the incremental poll', () => {
    expect(overridesFor('surveyScans')).toEqual([
      { collectionGroup: 'surveyScans', fieldPath: '*', ttl: false, indexes: [] },
      { collectionGroup: 'surveyScans', fieldPath: 'expiresAt', ttl: true, indexes: [] },
      {
        collectionGroup: 'surveyScans',
        fieldPath: 'createdAt',
        ttl: false,
        indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION' }],
      },
    ]);
  });

  it('expires a Survey moon tax with its survey, and indexes only createdAt, newest first', () => {
    expect(overridesFor('surveyTax')).toEqual([
      { collectionGroup: 'surveyTax', fieldPath: '*', ttl: false, indexes: [] },
      { collectionGroup: 'surveyTax', fieldPath: 'expiresAt', ttl: true, indexes: [] },
      {
        collectionGroup: 'surveyTax',
        fieldPath: 'createdAt',
        ttl: false,
        indexes: [{ order: 'DESCENDING', queryScope: 'COLLECTION' }],
      },
    ]);
  });

  it('expires an ignored-scan doc with its survey, and indexes only createdAt, for the incremental poll', () => {
    expect(overridesFor('surveyIgnores')).toEqual([
      { collectionGroup: 'surveyIgnores', fieldPath: '*', ttl: false, indexes: [] },
      { collectionGroup: 'surveyIgnores', fieldPath: 'expiresAt', ttl: true, indexes: [] },
      {
        collectionGroup: 'surveyIgnores',
        fieldPath: 'createdAt',
        ttl: false,
        indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION' }],
      },
    ]);
  });

  it('expires a Survey location and notes doc with its survey, and indexes only createdAt, newest first', () => {
    expect(overridesFor('surveyInfo')).toEqual([
      { collectionGroup: 'surveyInfo', fieldPath: '*', ttl: false, indexes: [] },
      { collectionGroup: 'surveyInfo', fieldPath: 'expiresAt', ttl: true, indexes: [] },
      {
        collectionGroup: 'surveyInfo',
        fieldPath: 'createdAt',
        ttl: false,
        indexes: [{ order: 'DESCENDING', queryScope: 'COLLECTION' }],
      },
    ]);
  });

  it.each(DISPATCHER_COLLECTION_GROUPS)('leaves %s automatically indexed', (group) => {
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
      {
        collectionGroup: 'projections',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: 'deviceId', order: 'ASCENDING' },
          { fieldPath: 'characterId', order: 'ASCENDING' },
          { fieldPath: 'fired', order: 'ASCENDING' },
        ],
      },
    ]);
  });
});
