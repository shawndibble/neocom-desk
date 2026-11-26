import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { REVALIDATION_COALESCE_MS } from './useRouteSnapshot';

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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not re-run the loader once per revalidation signal forever', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { useRouteSnapshot } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    let callCount = 0;
    const load = vi.fn(async () => {
      callCount += 1;
      cache.__emit();
      return `snapshot-${callCount}`;
    });

    const { result } = renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(callCount).toBeLessThan(6);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).not.toBeNull();
  });

  it('bounds the chain even when every reload takes longer than any plausible cooldown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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

    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30);
      });
    }
    vi.useRealTimers();

    expect(callCount).toBeLessThan(6);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).not.toBeNull();
  });

  it('still reloads a genuine settle that arrives well after a previous chain ended', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { useRouteSnapshot } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    let callCount = 0;
    const load = vi.fn(async () => {
      callCount += 1;
      if (callCount <= 2) cache.__emit();
      return `data-${callCount}`;
    });

    const { result } = renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 2, hydrated: true }));

    for (let i = 0; i < 5 && result.current.data !== 'data-3'; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REVALIDATION_COALESCE_MS + 50);
      });
    }
    expect(result.current.data).toBe('data-3');

    act(() => cache.__emit());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVALIDATION_COALESCE_MS + 50);
    });
    expect(result.current.data).toBe('data-4');
  });

  it('collapses settles that arrive between loads into one trailing reload per window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { useRouteSnapshot } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    const load = vi.fn(async () => 'data');

    renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(load).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 40; i += 1) {
      act(() => cache.__emit());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
    expect(load.mock.calls.length - 1).toBeLessThanOrEqual(5);
    expect(load.mock.calls.length - 1).toBeGreaterThanOrEqual(2);
  });

  it('still delivers a lone settle after the coalescing window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { useRouteSnapshot } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    let n = 0;
    const load = vi.fn(async () => `data-${(n += 1)}`);

    const { result } = renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data).toBe('data-1');

    act(() => cache.__emit());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVALIDATION_COALESCE_MS + 50);
    });
    expect(result.current.data).toBe('data-2');
  });

  it('drops a pending coalesced reload on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { useRouteSnapshot } = await import('./useRouteSnapshot');
    const cache = (await import('@/esi/cache')) as unknown as { __emit: () => void };
    const load = vi.fn(async () => 'data');

    const { unmount } = renderHook(() => useRouteSnapshot(load));
    act(() => useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => cache.__emit());
    unmount();
    await vi.advanceTimersByTimeAsync(REVALIDATION_COALESCE_MS + 50);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
