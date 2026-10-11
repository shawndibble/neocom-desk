import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import type { SyncStatus } from '@/sync/status';
import { OVERVIEW_LAYOUT_KEY } from './layoutStore';
import { useFirstRunReady } from './useFirstRunReady';

let listeners: ((status: SyncStatus) => void)[] = [];

vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  // Sync is configured, so the gate has a first pull to wait for.
  isSyncConfigured: () => true,
}));

vi.mock('@/sync', () => ({
  getSyncStatus: () => ({ state: 'idle', lastSyncedAt: null, error: null }),
  setSyncedSetting: vi.fn(async () => undefined),
  scheduleSync: vi.fn(),
}));

vi.mock('@/sync/status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sync/status')>()),
  subscribeSyncStatus: (listener: (status: SyncStatus) => void) => {
    listeners.push(listener);
    listener({ state: 'syncing', lastSyncedAt: null, error: null });
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
}));

const announce = (status: Partial<SyncStatus>) =>
  act(() => {
    for (const listener of listeners) {
      listener({ state: 'idle', lastSyncedAt: null, error: null, ...status });
    }
  });

beforeEach(async () => {
  listeners = [];
  await db.settings.clear();
});

describe('useFirstRunReady', () => {
  it('is not ready while the first pull is still running', () => {
    const { result } = renderHook(() => useFirstRunReady(true));
    expect(result.current).toBe(false);
  });

  it('is ready once the first pull has landed and Dexie holds no layout', async () => {
    const { result } = renderHook(() => useFirstRunReady(true));
    await announce({ state: 'idle', lastSyncedAt: Date.now() });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays quiet when the pull brought a layout down, so nothing is asked or overwritten', async () => {
    await db.settings.put({
      key: OVERVIEW_LAYOUT_KEY,
      value: { version: 1, widgets: [] },
    });
    const { result } = renderHook(() => useFirstRunReady(true));
    await announce({ state: 'idle', lastSyncedAt: Date.now() });
    // Give the Dexie check time to have run.
    await act(async () => {
      await db.settings.get('sync.__probe');
    });
    expect(result.current).toBe(false);
  });

  it('waits for the settings store to hydrate even when sync has settled', async () => {
    const { result } = renderHook(() => useFirstRunReady(false));
    await announce({ state: 'idle', lastSyncedAt: Date.now() });
    await act(async () => {
      await db.settings.get('sync.__probe');
    });
    expect(result.current).toBe(false);
  });

  it('lets a failed sync through, so an offline pilot is still asked', async () => {
    const { result } = renderHook(() => useFirstRunReady(true));
    await announce({ state: 'error', error: 'offline' });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
