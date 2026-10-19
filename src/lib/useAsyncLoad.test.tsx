import { act, renderHook, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncLoad, useKeyedLoad } from './useAsyncLoad';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsyncLoad', () => {
  it('goes loading to ready with the data', async () => {
    const d = deferred<string>();
    const loader = () => d.promise;
    const { result } = renderHook(() => useAsyncLoad(loader));
    expect(result.current.status).toBe('loading');
    await act(async () => d.resolve('a'));
    expect(result.current).toMatchObject({ status: 'ready', data: 'a' });
  });

  it('reports a rejection as failed', async () => {
    const loader = () => Promise.reject(new Error('x'));
    const { result } = renderHook(() => useAsyncLoad(loader));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.data).toBeUndefined();
  });

  it('drops a stale result when the loader changes', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(({ loader }) => useAsyncLoad(loader), {
      initialProps: { loader: () => first.promise },
    });
    rerender({ loader: () => second.promise });
    await act(async () => first.resolve('old'));
    expect(result.current.status).toBe('loading');
    await act(async () => second.resolve('new'));
    expect(result.current).toMatchObject({ status: 'ready', data: 'new' });
  });

  it('does not set state after unmount', async () => {
    const d = deferred<string>();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loader = () => d.promise;
    const { unmount } = renderHook(() => useAsyncLoad(loader));
    unmount();
    await act(async () => d.resolve('a'));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('retry reloads, and a reconnect retries a failure by itself', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue('ok');
    const { result } = renderHook(() => useAsyncLoad(loader));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: 'ok' }));
    expect(loader).toHaveBeenCalledTimes(2);
    act(() => result.current.retry());
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(3));
  });
});

describe('useKeyedLoad', () => {
  it('stays idle for a null key or when told to', () => {
    const loader = vi.fn(() => Promise.resolve(1));
    const { result, rerender } = renderHook(
      ({ key, idle }: { key: string | null; idle: boolean }) => useKeyedLoad(key, loader, idle),
      { initialProps: { key: null as string | null, idle: false } }
    );
    expect(result.current.status).toBe('idle');
    rerender({ key: 'a', idle: true });
    expect(result.current.status).toBe('idle');
    expect(loader).not.toHaveBeenCalled();
  });

  it('hides another key’s data and keeps the same key’s data across a loader change', async () => {
    const { result, rerender } = renderHook(
      ({ key, value }: { key: string; value: number }) =>
        useKeyedLoad(
          key,
          useCallback(() => Promise.resolve(value), [value])
        ),
      { initialProps: { key: 'a', value: 1 } }
    );
    await waitFor(() => expect(result.current.data).toBe(1));
    rerender({ key: 'a', value: 2 });
    expect(result.current).toMatchObject({ status: 'ready', data: 1 });
    await waitFor(() => expect(result.current.data).toBe(2));
    rerender({ key: 'b', value: 2 });
    expect(result.current).toMatchObject({ status: 'loading', data: undefined });
  });
});
