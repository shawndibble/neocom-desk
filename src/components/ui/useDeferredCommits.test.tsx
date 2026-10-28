import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDeferredCommits, DEFERRED_COMMIT_CAP } from './useDeferredCommits';

function item(id: string, commit = vi.fn()) {
  return { id, message: `Deleted ${id}`, commit };
}

describe('useDeferredCommits', () => {
  it('holds an item without committing it, and hides its id', () => {
    const { result } = renderHook(() => useDeferredCommits());
    const a = item('a');
    act(() => result.current.defer(a));
    expect(a.commit).not.toHaveBeenCalled();
    expect(result.current.items.map((i) => i.id)).toEqual(['a']);
    expect(result.current.hiddenIds.has('a')).toBe(true);
  });

  it('undo drops the item without committing and shows the id again', () => {
    const { result } = renderHook(() => useDeferredCommits());
    const a = item('a');
    act(() => result.current.defer(a));
    act(() => result.current.undo('a'));
    expect(a.commit).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.hiddenIds.has('a')).toBe(false);
  });

  it('commit runs once, keeps the id hidden until it settles, then frees it', async () => {
    const { result } = renderHook(() => useDeferredCommits());
    let finish: () => void = () => {};
    const a = item(
      'a',
      vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    );
    act(() => result.current.defer(a));
    act(() => result.current.commit('a'));
    act(() => result.current.commit('a'));
    expect(a.commit).toHaveBeenCalledTimes(1);
    expect(result.current.items).toEqual([]);
    expect(result.current.hiddenIds.has('a')).toBe(true);
    await act(async () => finish());
    expect(result.current.hiddenIds.has('a')).toBe(false);
  });

  it('ignores a second defer of an id already pending', () => {
    const { result } = renderHook(() => useDeferredCommits());
    act(() => result.current.defer(item('a')));
    act(() => result.current.defer(item('a')));
    expect(result.current.items).toHaveLength(1);
  });

  it('commits the oldest when the stack passes its cap', () => {
    const { result } = renderHook(() => useDeferredCommits());
    const all = ['a', 'b', 'c', 'd'].map((id) => item(id));
    for (const i of all.slice(0, DEFERRED_COMMIT_CAP)) act(() => result.current.defer(i));
    expect(all[0].commit).not.toHaveBeenCalled();
    act(() => result.current.defer(all[3]));
    expect(all[0].commit).toHaveBeenCalledTimes(1);
    expect(result.current.items.map((i) => i.id)).toEqual(['b', 'c', 'd']);
  });

  it('commits everything pending on pagehide', () => {
    const { result } = renderHook(() => useDeferredCommits());
    const a = item('a');
    const b = item('b');
    act(() => {
      result.current.defer(a);
      result.current.defer(b);
    });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(a.commit).toHaveBeenCalledTimes(1);
    expect(b.commit).toHaveBeenCalledTimes(1);
  });

  it('commits everything pending when the page turns hidden, not when visible', () => {
    const { result } = renderHook(() => useDeferredCommits());
    const a = item('a');
    act(() => result.current.defer(a));
    const state = vi.spyOn(document, 'visibilityState', 'get');
    state.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(a.commit).not.toHaveBeenCalled();
    state.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(a.commit).toHaveBeenCalledTimes(1);
    state.mockRestore();
  });

  it('commits everything pending on unmount', () => {
    const { result, unmount } = renderHook(() => useDeferredCommits());
    const a = item('a');
    act(() => result.current.defer(a));
    unmount();
    expect(a.commit).toHaveBeenCalledTimes(1);
  });

  it('does not commit an undone item on unmount', () => {
    const { result, unmount } = renderHook(() => useDeferredCommits());
    const a = item('a');
    act(() => result.current.defer(a));
    act(() => result.current.undo('a'));
    unmount();
    expect(a.commit).not.toHaveBeenCalled();
  });
});
