import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as esiCache from '@/esi/cache';
import { useCorpSnapshot } from './useCorpSnapshot';

describe('useCorpSnapshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not load while the key is null — disabled, not loading', () => {
    const load = vi.fn(async () => 'data');
    const { result } = renderHook(() => useCorpSnapshot<string>(null, load));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads once a non-null key is supplied', async () => {
    const load = vi.fn(async () => 'data');
    const { result, rerender } = renderHook(({ key }) => useCorpSnapshot<string>(key, load), {
      initialProps: { key: null as string | null },
    });
    expect(result.current.loading).toBe(false);

    rerender({ key: 'k1' });
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data).toBe('data'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('resets and reloads when the key changes, discarding the previous key data', async () => {
    const load = vi.fn(async (): Promise<string> => 'first');
    const { result, rerender } = renderHook(({ key }) => useCorpSnapshot<string>(key, load), {
      initialProps: { key: 'k1' },
    });
    await waitFor(() => expect(result.current.data).toBe('first'));

    load.mockImplementation(async () => 'second');
    rerender({ key: 'k2' });

    // The old key's data must not leak into the new key's first render.
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('second'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('discards a resolved load whose key has since changed away', async () => {
    let resolveFirst: (value: string) => void = () => {};
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const load = vi.fn(async () => first);
    const { result, rerender } = renderHook(({ key }) => useCorpSnapshot<string>(key, load), {
      initialProps: { key: 'k1' },
    });
    expect(result.current.loading).toBe(true);

    load.mockImplementation(async () => 'second');
    rerender({ key: 'k2' });
    await waitFor(() => expect(result.current.data).toBe('second'));

    // The k1 load finally resolves after k2 already landed — must not
    // overwrite it with stale data.
    resolveFirst('first');
    await Promise.resolve();
    expect(result.current.data).toBe('second');
  });

  it('null-ing the key clears the data and stops treating it as loading', async () => {
    const load = vi.fn(async () => 'data');
    const { result, rerender } = renderHook(({ key }) => useCorpSnapshot<string>(key, load), {
      initialProps: { key: 'k1' as string | null },
    });
    await waitFor(() => expect(result.current.data).toBe('data'));

    rerender({ key: null });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('a failed load clears loading and leaves data null', async () => {
    const load = vi.fn(async (): Promise<string> => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useCorpSnapshot<string>('k1', load));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  describe('refresh', () => {
    it('bumps refreshCount, re-runs the loader, and invalidates the freshness window', async () => {
      const invalidateSpy = vi.spyOn(esiCache, 'invalidateFreshness');
      let call = 0;
      const load = vi.fn(async () => `v${++call}`);
      const { result } = renderHook(() => useCorpSnapshot<string>('k1', load));
      await waitFor(() => expect(result.current.data).toBe('v1'));
      expect(result.current.refreshCount).toBe(0);

      result.current.refresh();

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(result.current.data).toBe('v2'));
      expect(result.current.refreshCount).toBe(1);
      expect(load).toHaveBeenCalledTimes(2);
    });
  });
});
