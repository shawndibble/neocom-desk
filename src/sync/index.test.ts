// Pins the barrel's `await import('./planSync')` forwarding: a dropped argument
// (debounceMs) or a swallowed promise would be invisible in the UI until a sync
// silently stopped happening.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureSignedIn,
  markBuildPlanDeleted,
  markPlanDeleted,
  scheduleSync,
  setSyncedSetting,
  subscribeSyncStatus,
  triggerSync,
} from './index';

const driver = vi.hoisted(() => ({
  triggerSync: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
  markPlanDeleted: vi.fn(async () => {}),
  markBuildPlanDeleted: vi.fn(async () => {}),
  setSyncedSetting: vi.fn(async () => {}),
}));
vi.mock('./planSync', () => driver);

const auth = vi.hoisted(() => ({ ensureSignedIn: vi.fn(async () => 'char:1') }));
vi.mock('./syncAuth', () => auth);

beforeEach(() => {
  for (const fn of Object.values(driver)) fn.mockClear();
  auth.ensureSignedIn.mockClear();
});

describe('lazy sync driver', () => {
  it('forwards every mutation to the driver', async () => {
    await triggerSync(7);
    await markPlanDeleted(7, 'p1');
    await markBuildPlanDeleted(7, 'b1');
    await setSyncedSetting('sync.hub', 60003760);
    expect(driver.triggerSync).toHaveBeenCalledWith(7);
    expect(driver.markPlanDeleted).toHaveBeenCalledWith(7, 'p1');
    expect(driver.markBuildPlanDeleted).toHaveBeenCalledWith(7, 'b1');
    expect(driver.setSyncedSetting).toHaveBeenCalledWith('sync.hub', 60003760);
  });

  it('propagates a sync failure to the caller', async () => {
    driver.triggerSync.mockRejectedValueOnce(new Error('offline'));
    await expect(triggerSync(7)).rejects.toThrow('offline');
  });

  it('forwards scheduleSync with its debounce override', async () => {
    scheduleSync(7, 500);
    await vi.waitFor(() => expect(driver.scheduleSync).toHaveBeenCalledWith(7, 500));
  });

  it('forwards ensureSignedIn to the auth bridge', async () => {
    await expect(ensureSignedIn(1)).resolves.toBe('char:1');
  });

  it('exposes the status store synchronously, without awaiting the driver', () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeSyncStatus((s) => seen.push(s));
    unsubscribe();
    expect(seen).toEqual([{ state: 'idle', lastSyncedAt: null, error: null }]);
  });
});
