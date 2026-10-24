import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { PiSnapshotProvider, usePiSnapshot } from './usePiSnapshot';
import { lineageOf } from './snapshotLineage';
import type { ReactNode } from 'react';

const load = vi.fn();
// A spy tracks a rejected promise it returned as unhandled, so a failure is raised outside it.
let failing = false;
vi.mock('./goalPlannerSnapshot', () => ({
  loadGoalPlannerSnapshot: (id: number) =>
    failing ? new Promise((_, reject) => setTimeout(() => reject(new Error('x')), 0)) : load(id),
}));

const snap = (tag: string) => ({ tag }) as unknown as GoalPlannerSnapshot;

describe('usePiSnapshot', () => {
  beforeEach(() => {
    load.mockReset();
    failing = false;
  });

  it('loads the snapshot for the Character', async () => {
    const s = snap('a');
    load.mockResolvedValue(s);
    const { result } = renderHook(() => usePiSnapshot(7));
    expect(result.current.snapshot).toBeNull();
    await waitFor(() => expect(result.current.snapshot).toBe(s));
    expect(load).toHaveBeenCalledWith(7);
    expect(result.current.failed).toBe(false);
  });

  it('loads nothing without a Character', () => {
    const { result } = renderHook(() => usePiSnapshot(null));
    expect(load).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ snapshot: null, failed: false });
  });

  it('never shows another Character’s snapshot', async () => {
    load.mockResolvedValueOnce(snap('a')).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ id }) => usePiSnapshot(id), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    rerender({ id: 2 });
    expect(result.current.snapshot).toBeNull();
  });

  it('reports a failed read', async () => {
    failing = true;
    const { result } = renderHook(() => usePiSnapshot(1));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.snapshot).toBeNull();
  });

  it('re-reads when the reload key changes, keeping the old snapshot meanwhile', async () => {
    const first = snap('a');
    const second = snap('b');
    load.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result, rerender } = renderHook(({ key }) => usePiSnapshot(1, key), {
      initialProps: { key: 0 },
    });
    await waitFor(() => expect(result.current.snapshot).toBe(first));
    rerender({ key: 1 });
    expect(result.current.snapshot).toBe(first);
    await waitFor(() => expect(result.current.snapshot).toBe(second));
  });

  it('marks a re-read as the same pilot read again, and another Character as not', async () => {
    const first = snap('a');
    const reRead = snap('b');
    const other = snap('c');
    load.mockResolvedValueOnce(first).mockResolvedValueOnce(reRead).mockResolvedValueOnce(other);
    const { result, rerender } = renderHook(({ id, key }) => usePiSnapshot(id, key), {
      initialProps: { id: 1, key: 0 },
    });
    await waitFor(() => expect(result.current.snapshot).toBe(first));
    rerender({ id: 1, key: 1 });
    await waitFor(() => expect(result.current.snapshot).toBe(reRead));
    expect(lineageOf(reRead)).toBe(lineageOf(first));
    rerender({ id: 2, key: 1 });
    await waitFor(() => expect(result.current.snapshot).toBe(other));
    expect(lineageOf(other)).not.toBe(lineageOf(first));
  });

  it('retrying holds from the click until a fresh snapshot lands', async () => {
    const first = snap('a');
    const second = snap('b');
    let release!: (s: GoalPlannerSnapshot) => void;
    load.mockResolvedValueOnce(first).mockReturnValueOnce(new Promise((res) => (release = res)));
    const { result } = renderHook(() => usePiSnapshot(1));
    await waitFor(() => expect(result.current.snapshot).toBe(first));
    expect(result.current.retrying).toBe(false);
    act(() => result.current.retry());
    expect(result.current.retrying).toBe(true);
    expect(result.current.snapshot).toBe(first);
    await act(async () => release(second));
    expect(result.current.snapshot).toBe(second);
    expect(result.current.retrying).toBe(false);
  });

  it('shares one read between consumers under a provider', async () => {
    const s = snap('shared');
    load.mockResolvedValue(s);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PiSnapshotProvider characterId={7}>{children}</PiSnapshotProvider>
    );
    const { result } = renderHook(() => [usePiSnapshot(7), usePiSnapshot(7)], { wrapper });
    await waitFor(() => expect(result.current[0].snapshot).toBe(s));
    expect(result.current[1].snapshot).toBe(s);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads its own read for a Character the provider does not serve', async () => {
    load.mockImplementation((id: number) => Promise.resolve(snap(String(id))));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PiSnapshotProvider characterId={7}>{children}</PiSnapshotProvider>
    );
    const { result } = renderHook(() => usePiSnapshot(8), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(load).toHaveBeenCalledWith(8);
  });

  it('re-reads under a provider when its reloadKey changes', async () => {
    let key = 0;
    const first = snap('first');
    const second = snap('second');
    load.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { result, rerender } = renderHook(() => usePiSnapshot(7), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PiSnapshotProvider characterId={7} reloadKey={key}>
          {children}
        </PiSnapshotProvider>
      ),
    });
    await waitFor(() => expect(result.current.snapshot).toBe(first));
    key = 1;
    rerender();
    await waitFor(() => expect(result.current.snapshot).toBe(second));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
