import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { usePiSnapshot } from './usePiSnapshot';

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
});
