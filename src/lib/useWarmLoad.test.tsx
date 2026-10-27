import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  ACCOUNT_SNAPSHOT_ID,
  forgetRouteSnapshots,
  resetRouteSnapshots,
} from './routeSnapshotCache';
import { useWarmLoad, WARM_LOAD_FRESH_MS } from './useWarmLoad';

const EMPTY: readonly string[] = [];

beforeEach(() => {
  resetRouteSnapshots();
  vi.useRealTimers();
});

describe('useWarmLoad', () => {
  it('starts empty, then shows what the load returns', async () => {
    const load = vi.fn(() => Promise.resolve(['a']));
    const { result } = renderHook(() => useWarmLoad('view', 1, load, EMPTY));
    expect(result.current).toBe(EMPTY);
    await waitFor(() => expect(result.current).toEqual(['a']));
  });

  it('starts a later mount from the last load, and skips reloading one that recent', async () => {
    const first = renderHook(() => useWarmLoad('view', 1, () => Promise.resolve(['a']), EMPTY));
    await waitFor(() => expect(first.result.current).toEqual(['a']));
    const loaded = first.result.current;
    first.unmount();

    const load = vi.fn(() => Promise.resolve(['b']));
    const second = renderHook(() => useWarmLoad('view', 1, load, EMPTY));
    expect(second.result.current).toBe(loaded);
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
  });

  it('reloads behind a warm start once the last load is older than the fresh window', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const first = renderHook(() => useWarmLoad('view', 1, () => Promise.resolve(['a']), EMPTY));
    await waitFor(() => expect(first.result.current).toEqual(['a']));
    first.unmount();

    now.mockReturnValue(1_000_000 + WARM_LOAD_FRESH_MS + 1);
    const second = renderHook(() => useWarmLoad('view', 1, () => Promise.resolve(['b']), EMPTY));
    expect(second.result.current).toEqual(['a']);
    await waitFor(() => expect(second.result.current).toEqual(['b']));
    now.mockRestore();
  });

  it('never hands one owner’s value to another', async () => {
    const first = renderHook(() => useWarmLoad('view', 1, () => Promise.resolve(['a']), EMPTY));
    await waitFor(() => expect(first.result.current).toEqual(['a']));
    const second = renderHook(() =>
      useWarmLoad('view', 2, () => new Promise<string[]>(() => {}), EMPTY)
    );
    expect(second.result.current).toBe(EMPTY);
  });

  it('loads nothing and stays empty with no owner', () => {
    const load = vi.fn(() => Promise.resolve(['a']));
    const { result } = renderHook(() => useWarmLoad('view', null, load, EMPTY));
    expect(result.current).toBe(EMPTY);
    expect(load).not.toHaveBeenCalled();
  });

  it('forgets account-wide values when any Character is purged', async () => {
    const first = renderHook(() =>
      useWarmLoad('assets', ACCOUNT_SNAPSHOT_ID, () => Promise.resolve(['a']), EMPTY)
    );
    await waitFor(() => expect(first.result.current).toEqual(['a']));
    first.unmount();
    forgetRouteSnapshots(42);
    const second = renderHook(() =>
      useWarmLoad('assets', ACCOUNT_SNAPSHOT_ID, () => new Promise<string[]>(() => {}), EMPTY)
    );
    expect(second.result.current).toBe(EMPTY);
  });
});
