import { describe, expect, it } from 'vitest';
import type { SkillPlanRecord } from '@/db';
import {
  mergeRecords,
  mergeSettings,
  TOMBSTONE_TTL_MS,
  type LocalTombstone,
  type RemotePlanDoc,
} from './merge';

const NOW = 1_756_000_000_000;
const HASH = 'owner-hash-a';

function localPlan(overrides: Partial<SkillPlanRecord> = {}): SkillPlanRecord {
  return {
    id: 'p1',
    characterId: 1,
    name: 'Frigates V',
    entries: [{ skillTypeID: 3327, targetLevel: 5 }],
    remapCount: 1,
    updatedAt: NOW - 1000,
    ...overrides,
  };
}

function remotePlan(overrides: Partial<RemotePlanDoc> = {}): RemotePlanDoc {
  return {
    id: 'p1',
    characterId: 1,
    name: 'Frigates V',
    entries: [{ skillTypeID: 3327, targetLevel: 5 }],
    remapCount: 1,
    updatedAt: NOW - 1000,
    ownerHash: HASH,
    ...overrides,
  };
}

describe('mergeRecords', () => {
  it('pushes a plan that only exists locally', () => {
    const result = mergeRecords([localPlan()], [], [], NOW);
    expect(result.pushUpserts.map((p) => p.id)).toEqual(['p1']);
    expect(result.pullUpserts).toEqual([]);
  });

  it('pulls a plan that only exists remotely', () => {
    const result = mergeRecords([], [], [remotePlan()], NOW);
    expect(result.pullUpserts.map((p) => p.id)).toEqual(['p1']);
    expect(result.pushUpserts).toEqual([]);
  });

  it('LWW: newer local edit wins', () => {
    const result = mergeRecords(
      [localPlan({ updatedAt: NOW - 10 })],
      [],
      [remotePlan({ updatedAt: NOW - 500 })],
      NOW
    );
    expect(result.pushUpserts.map((p) => p.id)).toEqual(['p1']);
    expect(result.pullUpserts).toEqual([]);
  });

  it('LWW: newer remote edit wins', () => {
    const result = mergeRecords(
      [localPlan({ updatedAt: NOW - 500 })],
      [],
      [remotePlan({ updatedAt: NOW - 10 })],
      NOW
    );
    expect(result.pullUpserts.map((p) => p.id)).toEqual(['p1']);
    expect(result.pushUpserts).toEqual([]);
  });

  it('does nothing when timestamps are equal (already in sync)', () => {
    const result = mergeRecords([localPlan()], [], [remotePlan()], NOW);
    expect(result).toEqual({
      pushUpserts: [],
      pushTombstones: [],
      pullUpserts: [],
      deleteLocal: [],
      purgeRemote: [],
      clearLocalTombstones: [],
    });
  });

  it('pushes a local tombstone when the remote copy is older than the delete', () => {
    const tombstone: LocalTombstone = { id: 'p1', deletedAt: NOW - 100 };
    const result = mergeRecords([], [tombstone], [remotePlan({ updatedAt: NOW - 500 })], NOW);
    expect(result.pushTombstones).toEqual([tombstone]);
    expect(result.pullUpserts).toEqual([]);
  });

  it('a remote edit newer than the local delete resurrects the plan', () => {
    const tombstone: LocalTombstone = { id: 'p1', deletedAt: NOW - 500 };
    const result = mergeRecords([], [tombstone], [remotePlan({ updatedAt: NOW - 100 })], NOW);
    expect(result.pullUpserts.map((p) => p.id)).toEqual(['p1']);
    expect(result.pushTombstones).toEqual([]);
    expect(result.clearLocalTombstones).toContain('p1');
  });

  it('clears a local tombstone with no remote counterpart', () => {
    const result = mergeRecords([], [{ id: 'p1', deletedAt: NOW - 100 }], [], NOW);
    expect(result.clearLocalTombstones).toEqual(['p1']);
    expect(result.pushTombstones).toEqual([]);
  });

  it('remote tombstone deletes the local plan', () => {
    const result = mergeRecords(
      [localPlan({ updatedAt: NOW - 500 })],
      [],
      [remotePlan({ updatedAt: NOW - 100, deleted: true })],
      NOW
    );
    expect(result.deleteLocal).toEqual(['p1']);
    expect(result.pushUpserts).toEqual([]);
  });

  it('a local edit newer than a remote tombstone resurrects the plan', () => {
    const result = mergeRecords(
      [localPlan({ updatedAt: NOW - 100 })],
      [],
      [remotePlan({ updatedAt: NOW - 500, deleted: true })],
      NOW
    );
    expect(result.pushUpserts.map((p) => p.id)).toEqual(['p1']);
    expect(result.deleteLocal).toEqual([]);
  });

  it('purges remote tombstones older than 30 days', () => {
    const result = mergeRecords(
      [],
      [],
      [remotePlan({ updatedAt: NOW - TOMBSTONE_TTL_MS - 1, deleted: true })],
      NOW
    );
    expect(result.purgeRemote).toEqual(['p1']);
  });

  it('keeps remote tombstones younger than 30 days', () => {
    const result = mergeRecords(
      [],
      [],
      [remotePlan({ updatedAt: NOW - TOMBSTONE_TTL_MS + 1000, deleted: true })],
      NOW
    );
    expect(result.purgeRemote).toEqual([]);
    expect(result.deleteLocal).toEqual([]);
  });

  it('ignores and clears expired local tombstones (remote live copy gets pulled)', () => {
    const tombstone: LocalTombstone = { id: 'p1', deletedAt: NOW - TOMBSTONE_TTL_MS - 1 };
    const result = mergeRecords(
      [],
      [tombstone],
      [remotePlan({ updatedAt: NOW - TOMBSTONE_TTL_MS })],
      NOW
    );
    expect(result.clearLocalTombstones).toEqual(['p1']);
    expect(result.pullUpserts.map((p) => p.id)).toEqual(['p1']);
  });

  it('a live local row supersedes its own stale tombstone', () => {
    const result = mergeRecords([localPlan()], [{ id: 'p1', deletedAt: NOW - 5000 }], [], NOW);
    expect(result.clearLocalTombstones).toEqual(['p1']);
    expect(result.pushUpserts.map((p) => p.id)).toEqual(['p1']);
  });

  it('merges independent plans on both sides', () => {
    const result = mergeRecords([localPlan({ id: 'a' })], [], [remotePlan({ id: 'b' })], NOW);
    expect(result.pushUpserts.map((p) => p.id)).toEqual(['a']);
    expect(result.pullUpserts.map((p) => p.id)).toEqual(['b']);
  });
});

describe('mergeSettings', () => {
  it('pushes local-only keys and pulls remote-only keys', () => {
    const result = mergeSettings(
      [{ key: 'sync.theme', value: 'dark', updatedAt: NOW }],
      [{ key: 'sync.hub', value: 'jita', updatedAt: NOW }]
    );
    expect(result.push.map((s) => s.key)).toEqual(['sync.theme']);
    expect(result.pull.map((s) => s.key)).toEqual(['sync.hub']);
  });

  it('LWW per key', () => {
    const result = mergeSettings(
      [
        { key: 'sync.a', value: 1, updatedAt: NOW },
        { key: 'sync.b', value: 1, updatedAt: NOW - 100 },
      ],
      [
        { key: 'sync.a', value: 2, updatedAt: NOW - 100 },
        { key: 'sync.b', value: 2, updatedAt: NOW },
      ]
    );
    expect(result.push.map((s) => s.key)).toEqual(['sync.a']);
    expect(result.pull.map((s) => s.key)).toEqual(['sync.b']);
  });

  it('equal timestamps are left alone', () => {
    const result = mergeSettings(
      [{ key: 'sync.a', value: 1, updatedAt: NOW }],
      [{ key: 'sync.a', value: 1, updatedAt: NOW }]
    );
    expect(result).toEqual({ push: [], pull: [] });
  });
});
