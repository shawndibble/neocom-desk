import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { BACKGROUND_SYNC_MIN_GAP_MS, shouldSweep, useBackgroundSync } from './backgroundSync';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
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
  setVisibility('visible');
});

describe('shouldSweep', () => {
  it('sweeps when nothing has swept yet', () => {
    expect(shouldSweep(null, NOW)).toBe(true);
  });

  it('holds off inside the gap, so a tab flicked back and forth syncs once', () => {
    expect(shouldSweep(NOW, NOW + BACKGROUND_SYNC_MIN_GAP_MS - 1)).toBe(false);
  });

  it('sweeps again once the gap has passed', () => {
    expect(shouldSweep(NOW, NOW + BACKGROUND_SYNC_MIN_GAP_MS)).toBe(true);
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

  it('ignores the event that hides the tab', () => {
    vi.useFakeTimers({ now: NOW });
    try {
      renderHook(() => useBackgroundSync([1]));
      syncMock.scheduleSync.mockClear();
      vi.setSystemTime(NOW + BACKGROUND_SYNC_MIN_GAP_MS);
      setVisibility('hidden');

      becomeVisible();

      expect(syncMock.scheduleSync).not.toHaveBeenCalled();
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
});
