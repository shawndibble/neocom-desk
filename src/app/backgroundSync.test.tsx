import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  BACKGROUND_SYNC_MIN_GAP_MS,
  BACKGROUND_SYNC_TICK_MS,
  idsToSweep,
  useBackgroundSync,
} from './backgroundSync';

const syncMock = vi.hoisted(() => ({
  scheduleSync: vi.fn(),
  getSyncStatus: vi.fn(() => ({ state: 'idle', lastSyncedAt: null, error: null })),
}));
vi.mock('@/sync', () => syncMock);
vi.mock('./syncStatus', () => ({ isSyncConfigured: () => true }));

const NOW = 1_756_000_000_000;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function becomeVisible() {
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.clearAllMocks();
  syncMock.getSyncStatus.mockReturnValue({ state: 'idle', lastSyncedAt: null, error: null });
  setVisibility('visible');
});

describe('idsToSweep', () => {
  it('sweeps a Character nothing has swept yet', () => {
    expect(idsToSweep([1], new Map(), NOW)).toEqual([1]);
  });

  it('holds off inside the gap, so a tab flicked back and forth syncs once', () => {
    expect(idsToSweep([1], new Map([[1, NOW]]), NOW + BACKGROUND_SYNC_MIN_GAP_MS - 1)).toEqual([]);
  });

  it('sweeps again once the gap has passed', () => {
    expect(idsToSweep([1], new Map([[1, NOW]]), NOW + BACKGROUND_SYNC_MIN_GAP_MS)).toEqual([1]);
  });

  it('holds off only the Characters that are not due', () => {
    const lastSweptAt = new Map([
      [1, NOW],
      [2, NOW - BACKGROUND_SYNC_MIN_GAP_MS],
    ]);
    expect(idsToSweep([1, 2], lastSweptAt, NOW)).toEqual([2]);
  });

  it('treats a Character it has never swept as due, whatever the others did', () => {
    expect(idsToSweep([1, 2], new Map([[1, NOW]]), NOW)).toEqual([2]);
  });
});

describe('useBackgroundSync', () => {
  it('sweeps every character on mount, not only the active one', () => {
    renderHook(() => useBackgroundSync([1, 2]));
    expect(syncMock.scheduleSync.mock.calls).toEqual([[1], [2]]);
  });

  it('sweeps again when a backgrounded tab is looked at after the gap', () => {
    vi.useFakeTimers({ now: NOW });
    try {
      renderHook(() => useBackgroundSync([1]));
      syncMock.scheduleSync.mockClear();

      vi.setSystemTime(NOW + BACKGROUND_SYNC_MIN_GAP_MS);
      becomeVisible();

      expect(syncMock.scheduleSync.mock.calls).toEqual([[1]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sweeps on the tick, for a tab that stayed visible the whole time', () => {
    // visibilitychange never fires when the user switches to another
    // application and the tab stays its window's foreground tab — the tick is
    // the only thing covering that, and it is the reported case.
    vi.useFakeTimers({ now: NOW });
    try {
      renderHook(() => useBackgroundSync([1]));
      syncMock.scheduleSync.mockClear();

      vi.advanceTimersByTime(BACKGROUND_SYNC_MIN_GAP_MS + BACKGROUND_SYNC_TICK_MS);

      expect(syncMock.scheduleSync.mock.calls).toEqual([[1]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not sweep on a visibility flicker inside the gap', () => {
    vi.useFakeTimers({ now: NOW });
    try {
      renderHook(() => useBackgroundSync([1]));
      syncMock.scheduleSync.mockClear();

      becomeVisible();

      expect(syncMock.scheduleSync).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not sweep while the tab is hidden, mount included', () => {
    setVisibility('hidden');
    renderHook(() => useBackgroundSync([1]));
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();

    // And the hidden mount must not have spent the gap the first real look wants.
    setVisibility('visible');
    becomeVisible();
    expect(syncMock.scheduleSync.mock.calls).toEqual([[1]]);
  });

  it('skips a Character whose sync is already in flight', () => {
    syncMock.getSyncStatus.mockReturnValue({ state: 'syncing', lastSyncedAt: null, error: null });
    renderHook(() => useBackgroundSync([1]));
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('sweeps a newly added Character at once, without waiting out the others gap', () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const { rerender } = renderHook(({ ids }) => useBackgroundSync(ids), {
        initialProps: { ids: [1] },
      });
      syncMock.scheduleSync.mockClear();

      rerender({ ids: [1, 2] });

      expect(syncMock.scheduleSync.mock.calls).toEqual([[2]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-sweep when the character list is rebuilt inside the gap', () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const { rerender } = renderHook(({ ids }) => useBackgroundSync(ids), {
        initialProps: { ids: [1, 2] },
      });
      syncMock.scheduleSync.mockClear();

      rerender({ ids: [1, 2] });

      expect(syncMock.scheduleSync).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing at all with no characters', () => {
    renderHook(() => useBackgroundSync([]));
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('sweeps once the character list lands, not only on the empty first render', () => {
    // useLiveQuery answers with [] before Dexie replies; the sweep has to
    // survive that or it never runs at all.
    const { rerender } = renderHook(({ ids }) => useBackgroundSync(ids), {
      initialProps: { ids: [] as number[] },
    });
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();

    rerender({ ids: [1, 2] });

    expect(syncMock.scheduleSync.mock.calls).toEqual([[1], [2]]);
  });

  it('stops ticking once unmounted', () => {
    vi.useFakeTimers({ now: NOW });
    try {
      const { unmount } = renderHook(() => useBackgroundSync([1]));
      syncMock.scheduleSync.mockClear();
      unmount();

      vi.advanceTimersByTime(BACKGROUND_SYNC_MIN_GAP_MS + BACKGROUND_SYNC_TICK_MS);

      expect(syncMock.scheduleSync).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
