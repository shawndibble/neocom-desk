import { describe, expect, it } from 'vitest';
import { syncSettled, type SyncSettledInput } from './firstRun';

const base: SyncSettledInput = {
  syncConfigured: true,
  state: 'syncing',
  lastSyncedAt: null,
  online: true,
  waitedOut: false,
};

describe('syncSettled', () => {
  it('is settled at once when sync is not configured', () => {
    expect(syncSettled({ ...base, syncConfigured: false })).toBe(true);
  });
  it('waits while the first pull has not landed', () => {
    expect(syncSettled(base)).toBe(false);
    expect(syncSettled({ ...base, state: 'idle' })).toBe(false);
  });
  it('is settled once a sync has completed', () => {
    expect(syncSettled({ ...base, state: 'idle', lastSyncedAt: 1 })).toBe(true);
  });
  it('lets go when sync failed, the device is offline, or the wait ran out', () => {
    expect(syncSettled({ ...base, state: 'error' })).toBe(true);
    expect(syncSettled({ ...base, online: false })).toBe(true);
    expect(syncSettled({ ...base, waitedOut: true })).toBe(true);
  });
});
