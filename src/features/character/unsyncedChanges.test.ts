import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '@/sync/status';
import { mayHaveUnsyncedChanges } from './unsyncedChanges';

const clean: SyncStatus = { state: 'idle', lastSyncedAt: 1_000, error: null };
const statuses: Record<number, SyncStatus> = {
  1: clean,
  2: { state: 'idle', lastSyncedAt: null, error: null },
  3: { state: 'error', lastSyncedAt: 1_000, error: 'boom' },
  4: { state: 'syncing', lastSyncedAt: 1_000, error: null },
};
const statusOf = (id: number) => statuses[id] ?? { state: 'idle', lastSyncedAt: null, error: null };

describe('mayHaveUnsyncedChanges', () => {
  it('is false when every Character synced cleanly and the device is online', () => {
    expect(
      mayHaveUnsyncedChanges({ characterIds: [1], syncConfigured: true, online: true, statusOf })
    ).toBe(false);
  });

  it('is true offline: nothing can be pushed', () => {
    expect(
      mayHaveUnsyncedChanges({ characterIds: [1], syncConfigured: true, online: false, statusOf })
    ).toBe(true);
  });

  it.each([
    ['never synced this session', 2],
    ['last sync failed', 3],
    ['a sync is still running', 4],
  ])('is true when %s', (_label, id) => {
    expect(
      mayHaveUnsyncedChanges({ characterIds: [id], syncConfigured: true, online: true, statusOf })
    ).toBe(true);
  });

  it('is true when any one Character of several is not clean', () => {
    expect(
      mayHaveUnsyncedChanges({ characterIds: [1, 3], syncConfigured: true, online: true, statusOf })
    ).toBe(true);
  });

  it('is true when an edit is scheduled but not yet pushed, even after a clean sync', () => {
    expect(
      mayHaveUnsyncedChanges({
        characterIds: [1],
        syncConfigured: true,
        online: true,
        statusOf,
        pendingOf: (id) => id === 1,
      })
    ).toBe(true);
  });

  it('is false without sync: there is no copy to fall behind', () => {
    expect(
      mayHaveUnsyncedChanges({ characterIds: [3], syncConfigured: false, online: false, statusOf })
    ).toBe(false);
  });
});
