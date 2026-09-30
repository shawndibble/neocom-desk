import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PaletteProvider, PaletteResult } from './types';
import { usePaletteSearch } from './usePaletteSearch';

function result(id: string): PaletteResult {
  return { id, label: id, run: () => {} };
}

function syncProvider(id: string, order: number, minQueryLength = 0): PaletteProvider {
  return {
    id,
    labelKey: id,
    order,
    minQueryLength,
    search: (query) => [result(`${id}:${query || 'empty'}`)],
  };
}

/** An async provider whose every search waits for the test to resolve it. */
function deferredProvider(order: number) {
  const pending: {
    query: string;
    signal: AbortSignal;
    resolve: (results: PaletteResult[]) => void;
  }[] = [];
  const provider: PaletteProvider = {
    id: 'slow',
    labelKey: 'slow',
    order,
    search: (query, signal) =>
      new Promise<PaletteResult[]>((resolve) => {
        pending.push({ query, signal, resolve });
      }),
  };
  return { provider, pending };
}

describe('usePaletteSearch', () => {
  it('returns groups in the providers’ fixed order, hiding empty and below-minimum ones', () => {
    const empty: PaletteProvider = { id: 'empty', labelKey: 'empty', order: 0, search: () => [] };
    const providers = [syncProvider('b', 2), syncProvider('a', 1), empty, syncProvider('c', 3, 1)];
    const { result: hook, rerender } = renderHook(
      ({ query }) => usePaletteSearch(providers, query),
      { initialProps: { query: '' } }
    );
    expect(hook.current.map((group) => group.provider.id)).toEqual(['a', 'b']);
    rerender({ query: 'x' });
    expect(hook.current.map((group) => group.provider.id)).toEqual(['a', 'b', 'c']);
  });

  it('renders sync groups at once while a late async group shows as loading', async () => {
    const slow = deferredProvider(0);
    const providers = [slow.provider, syncProvider('fast', 1)];
    const { result: hook } = renderHook(() => usePaletteSearch(providers, 'x'));

    expect(hook.current.map((group) => [group.provider.id, group.status])).toEqual([
      ['slow', 'loading'],
      ['fast', 'ready'],
    ]);
    expect(hook.current[1].results.map((r) => r.id)).toEqual(['fast:x']);

    const latest = slow.pending[slow.pending.length - 1];
    await act(async () => latest.resolve([result('late')]));
    expect(hook.current[0]).toMatchObject({ status: 'ready', results: [{ id: 'late' }] });
  });

  it('discards a stale query’s results and aborts its search', async () => {
    const slow = deferredProvider(0);
    const providers = [slow.provider];
    const { result: hook, rerender } = renderHook(
      ({ query }) => usePaletteSearch(providers, query),
      { initialProps: { query: 'a' } }
    );
    rerender({ query: 'ab' });
    const stale = slow.pending.filter((search) => search.query === 'a');
    const fresh = slow.pending.filter((search) => search.query === 'ab');
    expect(stale.length).toBeGreaterThan(0);
    for (const search of stale) expect(search.signal.aborted).toBe(true);

    // The first search answers after the second began: it must not land.
    await act(async () => stale.forEach((search) => search.resolve([result('stale')])));
    expect(hook.current[0].status).toBe('loading');

    await act(async () => fresh.forEach((search) => search.resolve([result('fresh')])));
    expect(hook.current[0].results.map((r) => r.id)).toEqual(['fresh']);
  });

  it('drops a group whose async search fails', async () => {
    const failing: PaletteProvider = {
      id: 'broken',
      labelKey: 'broken',
      order: 0,
      search: () => Promise.reject(new Error('offline')),
    };
    const providers = [failing];
    const { result: hook } = renderHook(() => usePaletteSearch(providers, 'x'));
    await act(async () => {});
    expect(hook.current).toEqual([]);
  });
});
