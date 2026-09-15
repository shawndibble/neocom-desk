import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * `useRouteSnapshot`'s own suite (`useRouteSnapshot.test.tsx`) never drives
 * `onCacheRevalidated`, so it cannot see this: a loader whose own reads
 * (`esi/cache.ts`'s grace-race path, one call per distinct key) emit a
 * revalidation signal is exactly what BPC Search's loader does — one
 * `loadRegionName`/`loadBlueprintLocation`/`loadContractLocationInfo` call
 * per distinct region/location, easily hundreds on a six-figure snapshot, any
 * of which can blow the 250ms grace window on a slow connection.
 *
 * `useRouteSnapshot`'s revalidation effect coalesces a signal that arrives
 * mid-load into one re-run once that load settles (`useRouteSnapshot.ts`'s
 * own doc comment) — and that coalescing already keeps a commit from being
 * lost: the current load always finishes and calls `setSnapshot` *before*
 * the coalesced follow-up starts, so `loading` never actually gets stuck at
 * `true` (verified directly against the pre-fix code, not just inferred).
 * What isn't bounded is the *chain* of follow-ups: without a cooldown, a
 * follow-up's own reads can provoke another signal the same way the
 * original load's did, on and on, forever — an unbounded string of reloads
 * running back to back in the background. On a page whose renders are cheap
 * that's wasted network and battery; on BPC Search, whose `useMemo`s
 * recompute over a six-figure row array on every one of those reloads, it
 * reads as the tab hanging — the user's own report ("stuck", "spinner never
 * stops"). `MAX_EMITS` caps the mocked emitter so this test proves
 * unboundedness without actually looping forever the way the real bug does —
 * an earlier version of this test OOMed a worker doing exactly that.
 */
const MAX_EMITS = 40;

vi.mock('@/esi/cache', () => {
  let listener: (() => void) | null = null;
  let emitted = 0;
  return {
    invalidateFreshness: vi.fn(),
    onCacheRevalidated: (fn: () => void) => {
      listener = fn;
      return () => {
        if (listener === fn) listener = null;
      };
    },
    __emit: () => {
      if (emitted >= MAX_EMITS) return;
      emitted += 1;
      listener?.();
    },
    // Test isolation only: the mock module is one instance for the whole
    // file, so a cap exhausted by one test would otherwise silently no-op
    // every `__emit` in the tests that follow it.
    __resetEmitCap: () => {
      emitted = 0;
    },
  };
});

describe('useRouteSnapshot cache-revalidation storm', () => {
  beforeEach(async () => {
    useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
    const cache = (await import('@/esi/cache')) as unknown as { __resetEmitCap: () => void };
    cache.__resetEmitCap();
  });

  it('does not re-run the loader once per revalidation signal forever', async () => {
    const { useRouteSnapshot } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    let callCount = 0;
    // Models BPC Search's loader: every call reads several cache keys, and
    // (on a slow connection) at least one of them blows its grace window and
    // signals a revalidation — same shape as `recordLateOutcome` in
    // `esi/cache.ts`, just synchronous here so the test stays fast.
    const load = vi.fn(async () => {
      callCount += 1;
      cache.__emit();
      return `snapshot-${callCount}`;
    });

    const { result } = renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true }));

    // Give the storm a real window to run away in — each round is a few
    // microtasks/effect passes, so this comfortably covers MAX_EMITS rounds
    // if nothing bounds it, without the test itself hanging.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    // Unbounded would mean callCount tracks MAX_EMITS + 1 (one run per
    // emitted signal, forever — this is what the pre-fix code did: 41 calls
    // in this exact window). The cooldown collapses a tightly-spaced storm
    // like this one into at most a couple of reloads.
    expect(callCount).toBeLessThan(5);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).not.toBeNull();
  });

  it('still reloads a genuine settle that arrives well after the storm has quieted', async () => {
    // The discriminating case: a fix that spends a lifetime budget per mount
    // (rather than throttling by time) would collapse the storm correctly but
    // then silently stop picking up real revalidations for the rest of a
    // long-lived page — this proves a later, isolated signal still lands.
    const { useRouteSnapshot, AUTO_REVALIDATION_COOLDOWN_MS } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    let callCount = 0;
    const load = vi.fn(async () => {
      callCount += 1;
      return `data-${callCount}`;
    });

    const { result } = renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 2, hydrated: true }));
    await waitFor(() => expect(result.current.data).toBe('data-1'));

    act(() => cache.__emit());
    await waitFor(() => expect(result.current.data).toBe('data-2'));

    // Well clear of the cooldown window that just collapsed one signal into
    // the reload above.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, AUTO_REVALIDATION_COOLDOWN_MS + 200));
    });

    act(() => cache.__emit());
    await waitFor(() => expect(result.current.data).toBe('data-3'));
  });
});
