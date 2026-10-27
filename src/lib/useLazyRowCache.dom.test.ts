import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLazyRowCache } from './useLazyRowCache';

describe('useLazyRowCache', () => {
  it('resolves and caches a value', async () => {
    const { result } = renderHook(() => useLazyRowCache<string, number>());
    const fetchValue = vi.fn().mockResolvedValue(42);

    await act(async () => {
      await result.current.load('a', fetchValue);
    });

    expect(result.current.byKey.get('a')).toBe(42);
    expect(fetchValue).toHaveBeenCalledTimes(1);
  });

  it('marks loading while the fetch is in flight', async () => {
    let resolveFetch: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      resolveFetch = resolve;
    });
    const { result } = renderHook(() => useLazyRowCache<string, number>());

    act(() => {
      void result.current.load('a', () => pending);
    });

    expect(result.current.loadingKeys.has('a')).toBe(true);
    expect(result.current.byKey.has('a')).toBe(false);

    await act(async () => {
      resolveFetch(7);
      await pending;
    });

    await waitFor(() => expect(result.current.loadingKeys.has('a')).toBe(false));
    expect(result.current.byKey.get('a')).toBe(7);
  });

  it('marks failed on rejection, and does not cache a value', async () => {
    const { result } = renderHook(() => useLazyRowCache<string, number>());
    const fetchValue = vi.fn().mockRejectedValue(new Error('nope'));

    await act(async () => {
      await result.current.load('a', fetchValue);
    });

    expect(result.current.failedKeys.has('a')).toBe(true);
    expect(result.current.byKey.has('a')).toBe(false);
    expect(result.current.loadingKeys.has('a')).toBe(false);
  });

  it('does not refetch an already-cached key', async () => {
    const { result } = renderHook(() => useLazyRowCache<string, number>());
    const fetchValue = vi.fn().mockResolvedValue(1);

    await act(async () => {
      await result.current.load('a', fetchValue);
    });
    await act(async () => {
      await result.current.load('a', fetchValue);
    });

    expect(fetchValue).toHaveBeenCalledTimes(1);
  });

  it('does not refetch a key already in flight', async () => {
    let resolveFetch: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchValue = vi.fn().mockReturnValue(pending);
    const { result } = renderHook(() => useLazyRowCache<string, number>());

    act(() => {
      void result.current.load('a', fetchValue);
      void result.current.load('a', fetchValue);
    });

    expect(fetchValue).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(1);
      await pending;
    });
  });

  it('retries a non-sticky key after a failure', async () => {
    const { result } = renderHook(() => useLazyRowCache<string, number>());
    const fetchValue = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(9);

    await act(async () => {
      await result.current.load('a', fetchValue);
    });
    expect(result.current.failedKeys.has('a')).toBe(true);

    await act(async () => {
      await result.current.load('a', fetchValue);
    });

    expect(fetchValue).toHaveBeenCalledTimes(2);
    expect(result.current.byKey.get('a')).toBe(9);
    expect(result.current.failedKeys.has('a')).toBe(false);
  });

  it('leaves a sticky key permanently attempted after a failure, until reset', async () => {
    const { result } = renderHook(() => useLazyRowCache<string, number>());
    const fetchValue = vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(9);

    await act(async () => {
      await result.current.load('a', fetchValue, { sticky: true });
    });
    expect(result.current.failedKeys.has('a')).toBe(true);

    // A retry attempt is a no-op: still marked attempted.
    await act(async () => {
      await result.current.load('a', fetchValue, { sticky: true });
    });
    expect(fetchValue).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.reset('a');
    });

    await act(async () => {
      await result.current.load('a', fetchValue, { sticky: true });
    });
    expect(fetchValue).toHaveBeenCalledTimes(2);
    expect(result.current.byKey.get('a')).toBe(9);
  });

  it('clears failedKeys immediately on reset, before the next load', async () => {
    const { result } = renderHook(() => useLazyRowCache<string, number>());
    const fetchValue = vi.fn().mockRejectedValue(new Error('nope'));

    await act(async () => {
      await result.current.load('a', fetchValue, { sticky: true });
    });
    expect(result.current.failedKeys.has('a')).toBe(true);

    act(() => {
      result.current.reset('a');
    });

    expect(result.current.failedKeys.has('a')).toBe(false);
  });

  it('keeps load and reset referentially stable across renders', () => {
    const { result, rerender } = renderHook(() => useLazyRowCache<string, number>());
    const firstLoad = result.current.load;
    const firstReset = result.current.reset;

    rerender();

    expect(result.current.load).toBe(firstLoad);
    expect(result.current.reset).toBe(firstReset);
  });
});
