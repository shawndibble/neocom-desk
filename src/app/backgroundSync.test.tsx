import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  BACKGROUND_SYNC_BOOT_DELAY_MS,
  BACKGROUND_SYNC_MIN_GAP_MS,
  BACKGROUND_SYNC_NON_ACTIVE_GAP_MS,
  BACKGROUND_SYNC_TICK_MS,
  SWEEP_STAMPS_KEY,
  idsToSweep,
  useBackgroundSync,
} from './backgroundSync';
import { PARTIAL_PASS_WINDOW_MS } from '@/sync/syncScheduler';

const syncMock = vi.hoisted(() => ({
  scheduleSync: vi.fn(),
  getSyncStatus: vi.fn<
    (characterId: number) => {
      state: string;
      lastSyncedAt: number | null;
      lastFullSyncAt?: number;
      error: null;
    }
  >(() => ({ state: 'idle', lastSyncedAt: null, error: null })),
}));
vi.mock('@/sync', () => syncMock);
vi.mock('./syncStatus', () => ({ isSyncConfigured: () => true }));

const leaderMock = vi.hoisted(() => {
  let leader = true;
  const listeners = new Set<() => void>();
  return {
    joinTabElection: (_job: string, listener: () => void) => {
      listeners.add(listener);
      return { isLeader: () => leader, leave: () => listeners.delete(listener) };
    },
    seats: () => listeners.size,
    setLeader(next: boolean) {
      leader = next;
      listeners.forEach((listener) => listener());
    },
  };
});
vi.mock('@/lib/tabLeader', () => leaderMock);

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
  localStorage.clear();
});

describe('idsToSweep', () => {
  it('sweeps a Character nothing has swept yet', () => {
    expect(idsToSweep([1], new Map(), NOW, 1)).toEqual([1]);
  });

  it('holds off inside the gap, so a tab flicked back and forth syncs once', () => {
    expect(idsToSweep([1], new Map([[1, NOW]]), NOW + BACKGROUND_SYNC_MIN_GAP_MS - 1, 1)).toEqual(
      []
    );
  });

  it('sweeps again once the gap has passed', () => {
    expect(idsToSweep([1], new Map([[1, NOW]]), NOW + BACKGROUND_SYNC_MIN_GAP_MS, 1)).toEqual([1]);
  });

  it('holds off only the Characters that are not due', () => {
    const lastSweptAt = new Map([
      [1, NOW],
      [2, NOW - BACKGROUND_SYNC_NON_ACTIVE_GAP_MS],
    ]);
    expect(idsToSweep([1, 2], lastSweptAt, NOW, null)).toEqual([2]);
  });

  it('treats a Character it has never swept as due, whatever the others did', () => {
    expect(idsToSweep([1, 2], new Map([[1, NOW]]), NOW, null)).toEqual([2]);
  });

  it('sweeps the active Character last, so the Firebase session ends on it', () => {
    expect(idsToSweep([1, 2, 3], new Map(), NOW, 1)).toEqual([2, 3, 1]);
  });

  it('gives a non-active Character the longer gap', () => {
    const lastSweptAt = new Map([
      [1, NOW],
      [2, NOW],
    ]);
    const afterActiveGap = NOW + BACKGROUND_SYNC_MIN_GAP_MS;
    expect(idsToSweep([1, 2], lastSweptAt, afterActiveGap, 1)).toEqual([1]);
    expect(idsToSweep([1, 2], lastSweptAt, NOW + BACKGROUND_SYNC_NON_ACTIVE_GAP_MS, 1)).toEqual([
      2, 1,
    ]);
  });

  it('still ends on the active Character when only the others are due', () => {
    expect(idsToSweep([1, 2], new Map([[1, NOW]]), NOW, 1)).toEqual([2, 1]);
  });

  it('ignores an active Character that is not in the list', () => {
    expect(idsToSweep([2], new Map(), NOW, 1)).toEqual([2]);
  });
});

describe('useBackgroundSync', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    return () => vi.useRealTimers();
  });

  function mountPastBoot(ids: number[], active: number | null = ids[0] ?? null) {
    const hook = renderHook(() => useBackgroundSync(ids, active));
    vi.advanceTimersByTime(BACKGROUND_SYNC_BOOT_DELAY_MS);
    return hook;
  }

  const swept = () => syncMock.scheduleSync.mock.calls.map(([id]) => id);

  it('sweeps every character shortly after mount, not only the active one', () => {
    mountPastBoot([1, 2]);
    expect(swept()).toEqual([2, 1]);
  });

  it('queues the sweep at background priority, so an edit overtakes it', () => {
    mountPastBoot([1, 2]);
    expect(
      syncMock.scheduleSync.mock.calls.map(
        ([, options]) => (options as { priority?: string }).priority
      )
    ).toEqual(['background', 'background']);
  });

  it('ends the sweep on the active Character even when the boot sync just covered it', () => {
    syncMock.getSyncStatus.mockImplementation((id: number) => ({
      state: 'idle',
      lastSyncedAt: id === 1 ? NOW : null,
      ...(id === 1 ? { lastFullSyncAt: NOW } : {}),
      error: null,
    }));
    mountPastBoot([1, 2], 1);
    expect(swept()).toEqual([2, 1]);
  });

  it('sweeps the other Characters on the longer gap', () => {
    mountPastBoot([1, 2], 1);
    syncMock.scheduleSync.mockClear();

    vi.advanceTimersByTime(BACKGROUND_SYNC_NON_ACTIVE_GAP_MS - BACKGROUND_SYNC_TICK_MS);
    expect(swept()).toContain(1);
    expect(swept()).not.toContain(2);
    syncMock.scheduleSync.mockClear();

    vi.advanceTimersByTime(2 * BACKGROUND_SYNC_TICK_MS);
    expect(swept()).toEqual([2, 1]);
  });

  it('holds the first sweep back while the visible route loads', () => {
    renderHook(() => useBackgroundSync([1, 2]));
    vi.advanceTimersByTime(BACKGROUND_SYNC_BOOT_DELAY_MS - 1);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('does not re-sync a Character that already synced inside the gap (the boot sync)', () => {
    syncMock.getSyncStatus.mockImplementation((id: number) => ({
      state: 'idle',
      lastSyncedAt: id === 1 ? NOW : null,
      ...(id === 1 ? { lastFullSyncAt: NOW } : {}),
      error: null,
    }));
    mountPastBoot([1, 2], 2);
    expect(swept()).toEqual([2]);
  });

  it('still sweeps a Character whose only recent pass was narrowed to an edit', () => {
    syncMock.getSyncStatus.mockImplementation((id: number) => ({
      state: 'idle',
      lastSyncedAt: id === 1 ? NOW : null,
      error: null,
    }));
    mountPastBoot([1, 2], 2);
    expect(swept()).toEqual([1, 2]);
  });

  it('keeps the narrowed-pass window inside the active Character sweep gap', () => {
    expect(PARTIAL_PASS_WINDOW_MS).toBeLessThanOrEqual(BACKGROUND_SYNC_MIN_GAP_MS);
  });

  it('never runs the delayed first sweep once unmounted', () => {
    const { unmount } = renderHook(() => useBackgroundSync([1]));
    unmount();
    vi.advanceTimersByTime(BACKGROUND_SYNC_BOOT_DELAY_MS);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('sweeps again when a backgrounded tab is looked at after the gap', () => {
    mountPastBoot([1]);
    syncMock.scheduleSync.mockClear();

    vi.setSystemTime(NOW + BACKGROUND_SYNC_BOOT_DELAY_MS + BACKGROUND_SYNC_MIN_GAP_MS);
    becomeVisible();

    expect(swept()).toEqual([1]);
  });

  it('sweeps on the tick, for a tab that stayed visible the whole time', () => {
    mountPastBoot([1]);
    syncMock.scheduleSync.mockClear();

    vi.advanceTimersByTime(BACKGROUND_SYNC_MIN_GAP_MS + BACKGROUND_SYNC_TICK_MS);

    expect(swept()).toEqual([1]);
  });

  it('does not sweep on a visibility flicker inside the gap', () => {
    mountPastBoot([1]);
    syncMock.scheduleSync.mockClear();

    becomeVisible();

    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('does not sweep while the tab is hidden, mount included', () => {
    setVisibility('hidden');
    mountPastBoot([1]);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();

    setVisibility('visible');
    becomeVisible();
    expect(swept()).toEqual([1]);
  });

  it('skips a Character whose sync is already in flight', () => {
    syncMock.getSyncStatus.mockReturnValue({ state: 'syncing', lastSyncedAt: null, error: null });
    mountPastBoot([1]);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('sweeps a newly added Character at once, without waiting out the others gap', () => {
    const { rerender } = renderHook(({ ids }) => useBackgroundSync(ids), {
      initialProps: { ids: [1] },
    });
    vi.advanceTimersByTime(BACKGROUND_SYNC_BOOT_DELAY_MS);
    syncMock.scheduleSync.mockClear();

    rerender({ ids: [1, 2] });

    expect(swept()).toEqual([2]);
  });

  it('does not re-sweep when the character list is rebuilt inside the gap', () => {
    const { rerender } = renderHook(({ ids }) => useBackgroundSync(ids), {
      initialProps: { ids: [1, 2] },
    });
    vi.advanceTimersByTime(BACKGROUND_SYNC_BOOT_DELAY_MS);
    syncMock.scheduleSync.mockClear();

    rerender({ ids: [1, 2] });

    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('does nothing at all with no characters', () => {
    mountPastBoot([]);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('sweeps once the character list lands, not only on the empty first render', () => {
    const { rerender } = renderHook(({ ids }) => useBackgroundSync(ids), {
      initialProps: { ids: [] as number[] },
    });
    vi.advanceTimersByTime(BACKGROUND_SYNC_BOOT_DELAY_MS);
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();

    rerender({ ids: [1, 2] });
    vi.advanceTimersByTime(BACKGROUND_SYNC_BOOT_DELAY_MS);

    expect(swept()).toEqual([1, 2]);
  });

  it('stops ticking once unmounted', () => {
    const { unmount } = mountPastBoot([1]);
    syncMock.scheduleSync.mockClear();
    unmount();

    vi.advanceTimersByTime(BACKGROUND_SYNC_MIN_GAP_MS + BACKGROUND_SYNC_TICK_MS);

    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('shares its sweep stamps, so a tab taking over does not re-sweep inside the gap', () => {
    mountPastBoot([1]);
    syncMock.scheduleSync.mockClear();

    mountPastBoot([1]);

    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it('sweeps anyway when the shared stamps are unreadable', () => {
    localStorage.setItem(SWEEP_STAMPS_KEY, 'not json');
    mountPastBoot([1]);
    expect(swept()).toEqual([1]);
  });

  it('stands down from the sweep election once unmounted', () => {
    const { unmount } = mountPastBoot([1]);
    expect(leaderMock.seats()).toBe(1);
    unmount();
    expect(leaderMock.seats()).toBe(0);
  });

  it('keeps its seat when the character list changes', () => {
    const { rerender } = renderHook(({ ids }) => useBackgroundSync(ids), {
      initialProps: { ids: [1] },
    });
    const seats = leaderMock.seats();
    rerender({ ids: [1, 2] });
    expect(leaderMock.seats()).toBe(seats);
  });

  describe('with another tab leading', () => {
    afterEach(() => leaderMock.setLeader(true));

    it('does not sweep while another tab leads', () => {
      leaderMock.setLeader(false);
      mountPastBoot([1]);
      vi.advanceTimersByTime(BACKGROUND_SYNC_MIN_GAP_MS + BACKGROUND_SYNC_TICK_MS);
      becomeVisible();
      expect(syncMock.scheduleSync).not.toHaveBeenCalled();
    });

    it('sweeps at once on taking leadership over', () => {
      leaderMock.setLeader(false);
      mountPastBoot([1]);
      leaderMock.setLeader(true);
      expect(swept()).toEqual([1]);
    });

    it('winning leadership at boot still waits out the boot delay', () => {
      leaderMock.setLeader(false);
      renderHook(() => useBackgroundSync([1]));
      leaderMock.setLeader(true);
      expect(syncMock.scheduleSync).not.toHaveBeenCalled();
      vi.advanceTimersByTime(BACKGROUND_SYNC_BOOT_DELAY_MS);
      expect(swept()).toEqual([1]);
    });
  });
});
