import { describe, expect, it } from 'vitest';
import type { SkillPlanRecord } from '@/db';
import {
  mergeFeed,
  mergeRecords,
  mergeSettings,
  TOMBSTONE_TTL_MS,
  type FeedRow,
  type LocalTombstone,
  type RemoteFeedDoc,
  type RemotePlanDoc,
  type SyncedSettingTombstone,
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

describe('mergeRecords: account-wide tombstones (#436)', () => {
  // A Character added after an account-wide delete has no per-Character
  // tombstone naming its cloned row (accountWideBackfill.ts's cloneOnto keeps
  // the source row's own updatedAt), so `l && !r` would otherwise push it as
  // a brand-new remote doc nothing can out-rank. `accountWide` lets a caller
  // supply a second, shared-key-only deletion signal that catches this
  // regardless of which id the row was copied onto.
  const sharedKey = (record: SkillPlanRecord) => String(record.characterId);

  it('drops a stale row instead of pushing it when the account-wide tombstone postdates it', () => {
    const result = mergeRecords([localPlan({ updatedAt: NOW - 2000 })], [], [], NOW, {
      sharedKey,
      deletedAtByKey: new Map([['1', NOW - 1000]]),
    });
    expect(result.pushUpserts).toEqual([]);
    expect(result.deleteLocal).toEqual(['p1']);
    expect(result.pushTombstones).toEqual([{ id: 'p1', deletedAt: NOW - 1000 }]);
  });

  it('self-heals a row already resurrected in sync with remote', () => {
    const result = mergeRecords(
      [localPlan({ updatedAt: NOW - 2000 })],
      [],
      [remotePlan({ updatedAt: NOW - 2000 })],
      NOW,
      { sharedKey, deletedAtByKey: new Map([['1', NOW - 1000]]) }
    );
    expect(result.pullUpserts).toEqual([]);
    expect(result.pushUpserts).toEqual([]);
    expect(result.deleteLocal).toEqual(['p1']);
    expect(result.pushTombstones).toEqual([{ id: 'p1', deletedAt: NOW - 1000 }]);
  });

  it('leaves a row edited after the account-wide tombstone alone', () => {
    const result = mergeRecords([localPlan({ updatedAt: NOW - 500 })], [], [], NOW, {
      sharedKey,
      deletedAtByKey: new Map([['1', NOW - 1000]]),
    });
    expect(result.pushUpserts.map((p) => p.id)).toEqual(['p1']);
    expect(result.deleteLocal).toEqual([]);
  });

  it('opts a row out of the check when sharedKey returns undefined', () => {
    const result = mergeRecords([localPlan({ updatedAt: NOW - 2000 })], [], [], NOW, {
      sharedKey: () => undefined,
      deletedAtByKey: new Map([['1', NOW - 1000]]),
    });
    expect(result.pushUpserts.map((p) => p.id)).toEqual(['p1']);
    expect(result.deleteLocal).toEqual([]);
  });
});

describe('mergeSettings', () => {
  const EMPTY_RESULT = {
    push: [],
    pull: [],
    pushTombstones: [],
    deleteLocal: [],
    purgeRemote: [],
    clearLocalTombstones: [],
  };

  it('pushes local-only keys and pulls remote-only keys', () => {
    const result = mergeSettings(
      [{ key: 'sync.theme', value: 'dark', updatedAt: NOW }],
      [],
      [{ key: 'sync.hub', value: 'jita', updatedAt: NOW }],
      NOW
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
      [],
      [
        { key: 'sync.a', value: 2, updatedAt: NOW - 100 },
        { key: 'sync.b', value: 2, updatedAt: NOW },
      ],
      NOW
    );
    expect(result.push.map((s) => s.key)).toEqual(['sync.a']);
    expect(result.pull.map((s) => s.key)).toEqual(['sync.b']);
  });

  it('equal timestamps are left alone', () => {
    const result = mergeSettings(
      [{ key: 'sync.a', value: 1, updatedAt: NOW }],
      [],
      [{ key: 'sync.a', value: 1, updatedAt: NOW }],
      NOW
    );
    expect(result).toEqual(EMPTY_RESULT);
  });

  it('pushes a settings tombstone when the remote copy is older than the delete', () => {
    const tombstone: SyncedSettingTombstone = { key: 'sync.a', deletedAt: NOW - 100 };
    const result = mergeSettings(
      [],
      [tombstone],
      [{ key: 'sync.a', value: 1, updatedAt: NOW - 500 }],
      NOW
    );
    expect(result.pushTombstones).toEqual([tombstone]);
    expect(result.pull).toEqual([]);
  });

  it('a remote write newer than the local delete resurrects the setting', () => {
    const tombstone: SyncedSettingTombstone = { key: 'sync.a', deletedAt: NOW - 500 };
    const result = mergeSettings(
      [],
      [tombstone],
      [{ key: 'sync.a', value: 2, updatedAt: NOW - 100 }],
      NOW
    );
    expect(result.pull).toEqual([{ key: 'sync.a', value: 2, updatedAt: NOW - 100 }]);
    expect(result.pushTombstones).toEqual([]);
    expect(result.clearLocalTombstones).toEqual(['sync.a']);
  });

  it('reasserts a local settings tombstone with no remote counterpart (not cleared)', () => {
    const tombstone: SyncedSettingTombstone = { key: 'sync.a', deletedAt: NOW - 100 };
    const result = mergeSettings([], [tombstone], [], NOW);
    expect(result.pushTombstones).toEqual([tombstone]);
    expect(result.clearLocalTombstones).toEqual([]);
  });

  it('a remote settings tombstone deletes the local setting', () => {
    const result = mergeSettings(
      [{ key: 'sync.a', value: 1, updatedAt: NOW - 500 }],
      [],
      [{ key: 'sync.a', updatedAt: NOW - 100, deleted: true }],
      NOW
    );
    expect(result.deleteLocal).toEqual(['sync.a']);
    expect(result.push).toEqual([]);
  });

  it('a local rewrite newer than a remote settings tombstone wins', () => {
    const result = mergeSettings(
      [{ key: 'sync.a', value: 9, updatedAt: NOW - 100 }],
      [],
      [{ key: 'sync.a', updatedAt: NOW - 500, deleted: true }],
      NOW
    );
    expect(result.push.map((s) => s.value)).toEqual([9]);
    expect(result.deleteLocal).toEqual([]);
  });

  it('purges remote settings tombstones older than 30 days', () => {
    const result = mergeSettings(
      [],
      [],
      [{ key: 'sync.a', updatedAt: NOW - TOMBSTONE_TTL_MS - 1, deleted: true }],
      NOW
    );
    expect(result.purgeRemote).toEqual(['sync.a']);
  });

  it('keeps remote settings tombstones younger than 30 days', () => {
    const result = mergeSettings(
      [],
      [],
      [{ key: 'sync.a', updatedAt: NOW - TOMBSTONE_TTL_MS + 1000, deleted: true }],
      NOW
    );
    expect(result.purgeRemote).toEqual([]);
    expect(result.deleteLocal).toEqual([]);
  });

  it('a live local write supersedes its own settings tombstone', () => {
    const result = mergeSettings(
      [{ key: 'sync.a', value: 1, updatedAt: NOW }],
      [{ key: 'sync.a', deletedAt: NOW - 5000 }],
      [],
      NOW
    );
    expect(result.clearLocalTombstones).toEqual(['sync.a']);
    expect(result.push.map((s) => s.key)).toEqual(['sync.a']);
  });

  it('a local settings tombstone is not time-limited (no TTL expiry)', () => {
    const tombstone: SyncedSettingTombstone = {
      key: 'sync.a',
      deletedAt: NOW - TOMBSTONE_TTL_MS * 4,
    };
    const result = mergeSettings(
      [],
      [tombstone],
      [{ key: 'sync.a', value: 1, updatedAt: NOW - TOMBSTONE_TTL_MS * 5 }],
      NOW
    );
    expect(result.pushTombstones).toEqual([tombstone]);
    expect(result.clearLocalTombstones).toEqual([]);
    expect(result.pull).toEqual([]);
  });

  it('does not clear a local tombstone just because remote already carries its own', () => {
    // The remote tombstone is only good for TOMBSTONE_TTL_MS. If the local
    // tombstone were cleared here, nothing would defend this device once the
    // remote copy is purged and a stale device re-pushes its pre-delete value.
    const tombstone: SyncedSettingTombstone = { key: 'sync.a', deletedAt: NOW - 1000 };
    const result = mergeSettings(
      [],
      [tombstone],
      [{ key: 'sync.a', updatedAt: NOW - 500, deleted: true }],
      NOW
    );
    expect(result.deleteLocal).toEqual([]);
    expect(result.clearLocalTombstones).toEqual([]);
  });

  it('reasserts the delete against a stale re-push after the remote tombstone was purged', () => {
    // Device A deleted sync.a and its remote tombstone has since aged out
    // (purged by some sync). Device B was offline the whole time and re-pushes
    // its pre-deletion copy as a live doc, older than the delete. Device A's
    // local tombstone (never cleared, per the two tests above) must win.
    const tombstone: SyncedSettingTombstone = { key: 'sync.a', deletedAt: NOW - 1000 };
    const result = mergeSettings(
      [],
      [tombstone],
      [{ key: 'sync.a', value: 'stale', updatedAt: NOW - 2000 }],
      NOW
    );
    expect(result.pushTombstones).toEqual([tombstone]);
    expect(result.pull).toEqual([]);
    expect(result.clearLocalTombstones).toEqual([]);
  });
});

function feedRow(overrides: Partial<FeedRow> = {}): FeedRow {
  return { id: 'occ-1', firedAt: NOW - 1000, ...overrides };
}

function remoteFeedRow(overrides: Partial<RemoteFeedDoc> = {}): RemoteFeedDoc {
  return { id: 'occ-1', firedAt: NOW - 1000, ownerHash: HASH, ...overrides };
}

describe('mergeFeed', () => {
  it('pushes a row that only exists locally, when within the push window', () => {
    const result = mergeFeed([feedRow()], new Set(['occ-1']), []);
    expect(result.pushCreate.map((r) => r.id)).toEqual(['occ-1']);
    expect(result.pushDismiss).toEqual([]);
    expect(result.pullCreate).toEqual([]);
    expect(result.pullDismiss).toEqual([]);
  });

  it('does not push a local-only row outside the push window', () => {
    // An old row still in the local archive (cap 300) but past the 30-day/100-row
    // sync window (CONTEXT.md round 45) is left alone, not pushed.
    const result = mergeFeed([feedRow()], new Set(), []);
    expect(result.pushCreate).toEqual([]);
  });

  it('pulls a row that only exists remotely', () => {
    const result = mergeFeed([], new Set(), [remoteFeedRow()]);
    expect(result.pullCreate.map((r) => r.id)).toEqual(['occ-1']);
    expect(result.pushCreate).toEqual([]);
  });

  it('does nothing when both sides have the row undismissed', () => {
    const result = mergeFeed([feedRow()], new Set(['occ-1']), [remoteFeedRow()]);
    expect(result).toEqual({ pushCreate: [], pushDismiss: [], pullCreate: [], pullDismiss: [] });
  });

  it('pushes a dismissal newer than the remote copy, within the push window', () => {
    const result = mergeFeed([feedRow({ dismissedAt: NOW - 10 })], new Set(['occ-1']), [
      remoteFeedRow(),
    ]);
    expect(result.pushDismiss.map((r) => r.id)).toEqual(['occ-1']);
    expect(result.pullDismiss).toEqual([]);
  });

  it('pushes a dismissal even when the row has aged out of the create-push window', () => {
    // The push window only gates whether a *new* row starts syncing (pushCreate);
    // once the remote side already has the row, a dismissal correction must
    // still reach it regardless of whether the row is still push-eligible today.
    const result = mergeFeed([feedRow({ dismissedAt: NOW - 10 })], new Set(), [remoteFeedRow()]);
    expect(result.pushDismiss.map((r) => r.id)).toEqual(['occ-1']);
    expect(result.pullDismiss).toEqual([]);
  });

  it('pulls a dismissal newer than the local copy, regardless of the local push window', () => {
    // The row has aged out of this device's push window but a dismissal from
    // another device must still win — see mergeFeed's doc comment.
    const result = mergeFeed([feedRow()], new Set(), [remoteFeedRow({ dismissedAt: NOW - 10 })]);
    expect(result.pullDismiss.map((r) => r.id)).toEqual(['occ-1']);
    expect(result.pushDismiss).toEqual([]);
  });

  it('never regresses a local dismissal that is newer than a stale remote copy', () => {
    const result = mergeFeed([feedRow({ dismissedAt: NOW - 10 })], new Set(['occ-1']), [
      remoteFeedRow({ dismissedAt: NOW - 5000 }),
    ]);
    expect(result.pushDismiss.map((r) => r.id)).toEqual(['occ-1']);
    expect(result.pullDismiss).toEqual([]);
  });

  it('produces no duplicate rows for the same Occurrence Key regardless of side', () => {
    const result = mergeFeed([feedRow({ dismissedAt: NOW - 10 })], new Set(['occ-1']), [
      remoteFeedRow(),
    ]);
    const touchedIds = [
      ...result.pushCreate,
      ...result.pushDismiss,
      ...result.pullCreate,
      ...result.pullDismiss,
    ].map((r) => r.id);
    expect(new Set(touchedIds).size).toBe(touchedIds.length);
  });
});
