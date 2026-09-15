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
 * What isn't bounded is the *chain* of follow-ups: without a cap, a
 * follow-up's own reads can provoke another signal the same way the
 * original load's did, on and on, forever — an unbounded string of reloads
 * running back to back in the background. On a page whose renders are cheap
 * that's wasted network and battery; on BPC Search, whose `useMemo`s
 * recompute over a six-figure row array on every one of those reloads, it
 * reads as the tab hanging — the user's own report ("stuck", "spinner never
 * stops"). `MAX_EMITS` is a runaway safety valve, not a number either test
 * approaches on purpose: with the fix's own cap in place the chain settles
 * at a handful of calls, nowhere near it. It exists so that if the fix ever
 * regresses back to unbounded, the mocked emitter still stops itself instead
 * of actually looping forever — an earlier version of this test OOMed a
 * worker doing exactly that before this cap was added.
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
    // in this exact window). The cap collapses a chain like this one into a
    // small, fixed number of reloads.
    expect(callCount).toBeLessThan(6);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).not.toBeNull();
  });

  it('bounds the chain even when every reload takes longer than any plausible cooldown', async () => {
    // Regression for a real gap CodeRabbit caught in review: a first version
    // of this fix throttled by wall-clock spacing between reloads. A single
    // reload slow enough to outlast that window (ordinary on the slow mobile
    // connection this bug was actually reported on) lets the throttle lapse
    // *during* the reload, so a time-based cap fails to bound this exact
    // case even though it bounds the fast/synchronous storm above. The fix
    // that replaced it counts consecutive bounces instead of elapsed time,
    // which has no window to outlast — this proves that holds regardless of
    // how long each reload takes.
    const { useRouteSnapshot } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    let callCount = 0;
    const load = vi.fn(async () => {
      callCount += 1;
      cache.__emit();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return `snapshot-${callCount}`;
    });

    const { result } = renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true }));

    // Several small act-wrapped waits rather than one long one: a single
    // `act(async () => await sleep(500))` only flushes React's queued work
    // once, at the end, which collapses a real multi-round chain down to a
    // couple of updates regardless of whether the code actually bounds it —
    // a false negative that would hide this exact regression. Polling in
    // small steps lets each round's reload actually commit and re-render.
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
    }

    expect(callCount).toBeLessThan(6);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).not.toBeNull();
  });

  it('still reloads a genuine settle that arrives well after a previous chain ended', async () => {
    // The discriminating case a lifetime-per-mount cap would fail: once a
    // chain settles cleanly (no signal arrives while that reload is
    // running) the budget resets, so a later, unrelated signal — a
    // different key going stale on its own, long after an earlier chain
    // ran and ended — still triggers a reload rather than being silently
    // dropped for the rest of a long-lived page.
    const { useRouteSnapshot } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    let callCount = 0;
    // The first two calls each emit (forming a short, real chain); every
    // call after that settles clean.
    const load = vi.fn(async () => {
      callCount += 1;
      if (callCount <= 2) cache.__emit();
      return `data-${callCount}`;
    });

    const { result } = renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 2, hydrated: true }));

    // The chain: initial load emits -> reload #2 emits -> reload #3 settles
    // clean (no more auto-emits), resetting the budget.
    await waitFor(() => expect(result.current.data).toBe('data-3'));

    // Long after that chain ended, one isolated, unrelated signal arrives.
    act(() => cache.__emit());
    await waitFor(() => expect(result.current.data).toBe('data-4'));
  });
});
