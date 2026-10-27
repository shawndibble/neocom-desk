import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import '@/i18n';
import { useSerialShareState } from './useSerialShareState';

const KEY = 'communities.fittings.failed';

describe('useSerialShareState', () => {
  it('loads, then reports a failed load', async () => {
    const ok = renderHook(() => useSerialShareState(async () => 1, KEY));
    await waitFor(() => expect(ok.result.current.loaded).toBe(1));
    expect(ok.result.current.loadFailed).toBe(false);

    const bad = renderHook(() =>
      useSerialShareState(() => Promise.reject<number>(new Error('x')), KEY)
    );
    await waitFor(() => expect(bad.result.current.loadFailed).toBe(true));
    expect(bad.result.current.loaded).toBeNull();
  });

  it('runs changes one after another, each from the state the last left', async () => {
    const fetchAll = vi.fn(async () => 0);
    const { result } = renderHook(() => useSerialShareState(fetchAll, KEY));
    await waitFor(() => expect(result.current.loaded).toBe(0));
    const seen: number[] = [];
    await act(async () => {
      void result.current.run(async (n) => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(n);
        return n + 1;
      });
      await result.current.run(async (n) => {
        seen.push(n);
        return n + 1;
      });
    });
    expect(seen).toEqual([0, 1]);
    expect(result.current.loaded).toBe(2);
  });

  it('a failed change sets the notice and reloads the truth', async () => {
    let truth = 5;
    const fetchAll = vi.fn(async () => truth);
    const { result } = renderHook(() => useSerialShareState(fetchAll, KEY));
    await waitFor(() => expect(result.current.loaded).toBe(5));
    truth = 7;
    await act(async () => {
      await result.current.run(async () => {
        throw new Error('nope');
      });
    });
    expect(result.current.notice).toBeTruthy();
    expect(result.current.loaded).toBe(7);
    await act(async () => {
      void result.current.run(async (n) => n);
    });
    expect(result.current.notice).toBeNull();
  });

  it('an older load never overwrites a newer one', async () => {
    const resolvers: ((n: number) => void)[] = [];
    const fetchAll = vi.fn(() => new Promise<number>((r) => resolvers.push(r)));
    const { result } = renderHook(() => useSerialShareState(fetchAll, KEY));
    let reloading: Promise<void>;
    act(() => {
      reloading = result.current.reload();
    });
    await act(async () => {
      resolvers[1](2);
      await reloading;
    });
    await act(async () => {
      resolvers[0](1);
    });
    expect(result.current.loaded).toBe(2);
  });
});
