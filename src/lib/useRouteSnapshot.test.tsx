import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useRouteSnapshot, type RouteSnapshotSignal } from './useRouteSnapshot';
import { forgetRouteSnapshots, resetRouteSnapshots } from './routeSnapshotCache';

const CHAR_A = 91;
const CHAR_B = 92;

interface Deferred {
  characterId: number;
  signal: RouteSnapshotSignal;
  resolve: (value: string) => void;
}

/**
 * A loader that never settles on its own: every call is parked so the test can
 * resolve them out of order, which is how a stale response is manufactured.
 */
function deferredLoader() {
  const calls: Deferred[] = [];
  const load = (characterId: number, signal: RouteSnapshotSignal): Promise<string> =>
    new Promise<string>((resolve) => {
      calls.push({ characterId, signal, resolve });
    });
  return { calls, load };
}

function setCharacter(characterId: number | null, hydrated = true) {
  act(() => useActiveCharacter.setState({ activeCharacterId: characterId, hydrated }));
}

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  resetRouteSnapshots();
});

describe('useRouteSnapshot', () => {
  it('loads once hydration resolves with a character', async () => {
    const load = vi.fn(async () => 'data-a');
    const { result } = renderHook(() => useRouteSnapshot(load));

    expect(load).not.toHaveBeenCalled();
    expect(result.current.hydrated).toBe(false);

    setCharacter(CHAR_A);
    await waitFor(() => expect(result.current.data).toBe('data-a'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(CHAR_A, { cancelled: false });
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshCount).toBe(0);
    expect(result.current.activeCharacterId).toBe(CHAR_A);
  });

  it('never loads while there is no active character', async () => {
    const load = vi.fn(async () => 'data-a');
    const { result } = renderHook(() => useRouteSnapshot(load));

    setCharacter(null); // hydrated, but nobody is logged in
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('stays loading until the snapshot for the current request key lands', async () => {
    const { calls, load } = deferredLoader();
    const { result } = renderHook(() => useRouteSnapshot(load));
    setCharacter(CHAR_A);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await act(async () => calls[0].resolve('data-a'));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('data-a');
  });

  it('re-runs the loader on refresh() and counts the refresh', async () => {
    const { calls, load } = deferredLoader();
    const { result } = renderHook(() => useRouteSnapshot(load));
    setCharacter(CHAR_A);

    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0].resolve('first'));
    expect(result.current.data).toBe('first');

    act(() => result.current.refresh());
    expect(result.current.refreshCount).toBe(1);
    // The previous refresh's snapshot is stamped with the old key, so the view
    // goes back to loading rather than showing pre-refresh data as current.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].resolve('second'));
    expect(result.current.data).toBe('second');
  });

  it('discards a response stamped for a previous refresh', async () => {
    const { calls, load } = deferredLoader();
    const { result } = renderHook(() => useRouteSnapshot(load));
    setCharacter(CHAR_A);
    await waitFor(() => expect(calls).toHaveLength(1));

    act(() => result.current.refresh());
    await waitFor(() => expect(calls).toHaveLength(2));

    // The pre-refresh load finally answers: it is for `91:0`, we are on `91:1`.
    await act(async () => calls[0].resolve('stale'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => calls[1].resolve('fresh'));
    expect(result.current.data).toBe('fresh');
  });

  it('never renders the previous character’s snapshot while the new one loads', async () => {
    const { calls, load } = deferredLoader();
    const { result } = renderHook(() => useRouteSnapshot(load));
    setCharacter(CHAR_A);
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => calls[0].resolve('character-a-data'));
    expect(result.current.data).toBe('character-a-data');

    // Character A's snapshot is still the only one in state, stamped `91:0`.
    setCharacter(CHAR_B);
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('discards a response that arrives after the character changed', async () => {
    const { calls, load } = deferredLoader();
    const { result } = renderHook(() => useRouteSnapshot(load));
    setCharacter(CHAR_A);
    await waitFor(() => expect(calls).toHaveLength(1));

    setCharacter(CHAR_B);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0].signal.cancelled).toBe(true);
    expect(calls[1].characterId).toBe(CHAR_B);

    await act(async () => calls[0].resolve('character-a-data'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => calls[1].resolve('character-b-data'));
    expect(result.current.data).toBe('character-b-data');
  });

  it('discards a cancelled response even when its key came round again', async () => {
    // Switching away and back re-uses the request key, so the stamp alone
    // cannot tell the two loads apart — this is the case `cancelled` covers.
    const { calls, load } = deferredLoader();
    const { result } = renderHook(() => useRouteSnapshot(load));
    setCharacter(CHAR_A);
    await waitFor(() => expect(calls).toHaveLength(1));
    setCharacter(CHAR_B);
    await waitFor(() => expect(calls).toHaveLength(2));
    setCharacter(CHAR_A);
    await waitFor(() => expect(calls).toHaveLength(3));

    await act(async () => calls[2].resolve('a-fresh'));
    expect(result.current.data).toBe('a-fresh');

    await act(async () => calls[0].resolve('a-stale'));
    expect(result.current.data).toBe('a-fresh');
  });

  it('does not set state for a response that arrives after unmount', async () => {
    const { calls, load } = deferredLoader();
    let renders = 0;
    const { unmount } = renderHook(() => {
      renders += 1;
      return useRouteSnapshot(load);
    });
    setCharacter(CHAR_A);
    await waitFor(() => expect(calls).toHaveLength(1));

    unmount();
    expect(calls[0].signal.cancelled).toBe(true);

    const rendersAtUnmount = renders;
    await act(async () => calls[0].resolve('too-late'));
    expect(renders).toBe(rendersAtUnmount);
  });

  it('surfaces a rejecting loader instead of spinning forever', async () => {
    // The failure mode this guards: no stamp means `loading` never clears, and
    // every route disables its Refresh button while loading — so the view is
    // unrecoverable without a page reload.
    const boom = new Error('offline');
    const { result } = renderHook(() => useRouteSnapshot(() => Promise.reject(boom)));
    setCharacter(CHAR_A);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(boom);
    expect(result.current.data).toBeNull();
  });

  it('recovers when a refresh after a failure succeeds', async () => {
    let attempt = 0;
    const { result } = renderHook(() =>
      useRouteSnapshot(() => {
        attempt += 1;
        return attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('ok');
      })
    );
    setCharacter(CHAR_A);
    await waitFor(() => expect(result.current.error).toBeTruthy());

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(result.current.error).toBeNull();
  });

  it('does not show a stale snapshot when the character returns to a previous one', async () => {
    // A -> B -> A. Keying on `characterId:refreshCount` repeats on the return,
    // so A's first snapshot would read as current for A's second load.
    const { result } = renderHook(() => useRouteSnapshot((id) => Promise.resolve(`data-${id}`)));
    setCharacter(CHAR_A);
    await waitFor(() => expect(result.current.data).toBe(`data-${CHAR_A}`));

    setCharacter(CHAR_B);
    setCharacter(CHAR_A);

    // Back on A with a load in flight: must report loading, not A's old data.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toBe(`data-${CHAR_A}`));
  });

  it('resets refreshCount when the character changes', async () => {
    // Wallet picks its offline copy off this: "refresh failed" vs "offline".
    // A new character's first load is an initial load, not a refresh.
    const { result } = renderHook(() => useRouteSnapshot((id) => Promise.resolve(id)));
    setCharacter(CHAR_A);
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.refreshCount).toBe(1));

    // The character switch is synchronous, but it also kicks off CHAR_B's
    // load — an already-resolved promise whose `.then` still needs a
    // microtask flush, or its state update lands outside `act`.
    await act(async () => setCharacter(CHAR_B));
    expect(result.current.refreshCount).toBe(0);
  });

  it('does not re-run the load when only the loader identity changes', async () => {
    const inner = vi.fn(async (characterId: number) => `data-${characterId}`);
    // Inline arrow: a fresh loader identity on every render must not re-fetch.
    const { result, rerender } = renderHook(() => useRouteSnapshot((id) => inner(id)));
    setCharacter(CHAR_A);
    await waitFor(() => expect(result.current.data).toBe(`data-${CHAR_A}`));

    rerender();
    rerender();
    expect(inner).toHaveBeenCalledTimes(1);
  });

  describe('staleWhileRevalidate (issue #418)', () => {
    it('keeps the previous data visible while a refresh reloads', async () => {
      const { calls, load } = deferredLoader();
      const { result } = renderHook(() =>
        useRouteSnapshot(load, undefined, { staleWhileRevalidate: true })
      );
      setCharacter(CHAR_A);
      await waitFor(() => expect(calls).toHaveLength(1));
      await act(async () => calls[0].resolve('first'));
      expect(result.current.data).toBe('first');

      act(() => result.current.refresh());
      // Unlike the default behaviour, `data` does not go back to null —
      // only `loading` reports the refresh is in flight.
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBe('first');

      await waitFor(() => expect(calls).toHaveLength(2));
      await act(async () => calls[1].resolve('second'));
      expect(result.current.data).toBe('second');
      expect(result.current.loading).toBe(false);
    });

    it('still reports no data on the very first load — nothing to carry yet', async () => {
      const { calls, load } = deferredLoader();
      const { result } = renderHook(() =>
        useRouteSnapshot(load, undefined, { staleWhileRevalidate: true })
      );
      setCharacter(CHAR_A);
      await waitFor(() => expect(calls).toHaveLength(1));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it('does not carry a previous character’s data across a character switch', async () => {
      const { result } = renderHook(() =>
        useRouteSnapshot((id) => Promise.resolve(`data-${id}`), undefined, {
          staleWhileRevalidate: true,
        })
      );
      setCharacter(CHAR_A);
      await waitFor(() => expect(result.current.data).toBe(`data-${CHAR_A}`));

      setCharacter(CHAR_B);
      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.data).toBe(`data-${CHAR_B}`));
    });

    it('keeps the previous data visible when a refresh fails', async () => {
      let attempt = 0;
      const boom = new Error('offline');
      const { result } = renderHook(() =>
        useRouteSnapshot(
          () => {
            attempt += 1;
            return attempt === 1 ? Promise.resolve('first') : Promise.reject(boom);
          },
          undefined,
          { staleWhileRevalidate: true }
        )
      );
      setCharacter(CHAR_A);
      await waitFor(() => expect(result.current.data).toBe('first'));

      act(() => result.current.refresh());
      await waitFor(() => expect(result.current.error).toBe(boom));
      // The failed refresh clears `loading` (Refresh is re-enabled) but must
      // not blank out the last data that did load successfully.
      expect(result.current.data).toBe('first');
    });
  });

  describe('prop-supplied character (second case, alongside the active-character store)', () => {
    it('loads for the prop character immediately, without waiting on store hydration', async () => {
      // Store never hydrates in this test — a prop-supplied character must not depend on it.
      const load = vi.fn(async (characterId: number) => `data-${characterId}`);
      const { result } = renderHook(() => useRouteSnapshot(load, CHAR_A));

      await waitFor(() => expect(result.current.data).toBe(`data-${CHAR_A}`));
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeCharacterId).toBe(CHAR_A);
      expect(load).toHaveBeenCalledWith(CHAR_A, { cancelled: false });
    });

    it('ignores the store character while a prop character is supplied', async () => {
      const load = vi.fn(async (characterId: number) => `data-${characterId}`);
      setCharacter(CHAR_B);
      const { result } = renderHook(() => useRouteSnapshot(load, CHAR_A));

      await waitFor(() => expect(result.current.data).toBe(`data-${CHAR_A}`));
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('reloads and cancels the in-flight request when the prop character changes', async () => {
      const { calls, load } = deferredLoader();
      const { result, rerender } = renderHook(
        ({ characterId }) => useRouteSnapshot(load, characterId),
        {
          initialProps: { characterId: CHAR_A },
        }
      );
      await waitFor(() => expect(calls).toHaveLength(1));

      rerender({ characterId: CHAR_B });
      await waitFor(() => expect(calls).toHaveLength(2));
      expect(calls[0].signal.cancelled).toBe(true);
      expect(calls[1].characterId).toBe(CHAR_B);

      await act(async () => calls[0].resolve('stale'));
      expect(result.current.data).toBeNull();

      await act(async () => calls[1].resolve('fresh'));
      expect(result.current.data).toBe('fresh');
    });
  });
});

describe('useRouteSnapshot cacheKey', () => {
  it("renders the previous visit's data on the first frame after a remount", async () => {
    const load = vi.fn(async () => 'data-a');
    setCharacter(CHAR_A);
    const first = renderHook(() => useRouteSnapshot(load, undefined, { cacheKey: 'demo' }));
    await waitFor(() => expect(first.result.current.data).toBe('data-a'));
    first.unmount();

    // The second mount's own load is parked, so anything on screen can only
    // have come from the retained snapshot.
    const { calls, load: parked } = deferredLoader();
    const second = renderHook(() => useRouteSnapshot(parked, undefined, { cacheKey: 'demo' }));

    expect(second.result.current.data).toBe('data-a');
    // `loading` stays honest — a load really is in flight, and Refresh reads it.
    expect(second.result.current.loading).toBe(true);

    act(() => calls[0].resolve('data-a2'));
    await waitFor(() => expect(second.result.current.data).toBe('data-a2'));
  });

  it('does not retain anything without a cacheKey', async () => {
    const load = vi.fn(async () => 'data-a');
    setCharacter(CHAR_A);
    const first = renderHook(() => useRouteSnapshot(load));
    await waitFor(() => expect(first.result.current.data).toBe('data-a'));
    first.unmount();

    const { load: parked } = deferredLoader();
    const second = renderHook(() => useRouteSnapshot(parked));
    expect(second.result.current.data).toBeNull();
  });

  it("never shows one character's retained snapshot under another", async () => {
    const load = vi.fn(async (characterId: number) => `data-${characterId}`);
    setCharacter(CHAR_A);
    const first = renderHook(() => useRouteSnapshot(load, undefined, { cacheKey: 'demo' }));
    await waitFor(() => expect(first.result.current.data).toBe(`data-${CHAR_A}`));
    first.unmount();

    const { calls, load: parked } = deferredLoader();
    setCharacter(CHAR_B);
    const second = renderHook(() => useRouteSnapshot(parked, undefined, { cacheKey: 'demo' }));
    expect(second.result.current.data).toBeNull();

    act(() => calls[0].resolve('data-b'));
    await waitFor(() => expect(second.result.current.data).toBe('data-b'));
  });

  it("drops the retained snapshot when that character's cache is purged", async () => {
    const load = vi.fn(async () => 'data-a');
    setCharacter(CHAR_A);
    const first = renderHook(() => useRouteSnapshot(load, undefined, { cacheKey: 'demo' }));
    await waitFor(() => expect(first.result.current.data).toBe('data-a'));
    first.unmount();

    forgetRouteSnapshots(CHAR_A);

    const { load: parked } = deferredLoader();
    const second = renderHook(() => useRouteSnapshot(parked, undefined, { cacheKey: 'demo' }));
    expect(second.result.current.data).toBeNull();
  });

  it('surfaces a failed reload while keeping the retained rows on screen', async () => {
    const load = vi.fn(async () => 'data-a');
    setCharacter(CHAR_A);
    const first = renderHook(() => useRouteSnapshot(load, undefined, { cacheKey: 'demo' }));
    await waitFor(() => expect(first.result.current.data).toBe('data-a'));
    first.unmount();

    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    const second = renderHook(() => useRouteSnapshot(failing, undefined, { cacheKey: 'demo' }));
    await waitFor(() => expect(second.result.current.error).toBeInstanceOf(Error));
    // Same contract `staleWhileRevalidate` already had for a failed refresh:
    // the error is reported and the views branch on it first, so the rows are
    // never presented as the fresh answer.
    expect(second.result.current.data).toBe('data-a');
  });
});
