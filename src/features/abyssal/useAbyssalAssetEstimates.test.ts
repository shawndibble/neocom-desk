// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AbyssalEstimate } from '@/market/mutamarket';
import { ABYSSAL_BACKGROUND_LOOKUPS, useAbyssalAssetEstimates } from './useAbyssalAssetEstimates';

const NEUT = 47832;
const TRIT = 34;

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  readCached: vi.fn(),
  listeners: new Set<(itemId: number, estimate: unknown) => void>(),
}));
const lookup = vi.hoisted(() => ({ isAbyssalType: (typeId: number) => typeId === 47832 }));
vi.mock('./mutaplasmidData', () => ({ useMutaplasmidLookup: () => lookup }));
vi.mock('@/market/mutamarket', () => ({
  ABYSSAL_UNAVAILABLE_RETRY_MS: 5 * 60 * 1000,
  getAbyssalEstimate: mocks.get,
  readCachedAbyssalEstimates: mocks.readCached,
  onAbyssalEstimate: (listener: (itemId: number, estimate: unknown) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));

function estimate(status: AbyssalEstimate['status'], value: number | null = null): AbyssalEstimate {
  return {
    status,
    value,
    source: 'mutamarket',
    fetchedAt: 0,
    valueUpdatedAt: null,
    url: 'https://mutamarket.com',
  };
}

const neut = (itemId: number) => ({ item_id: itemId, type_id: NEUT });
const characterIdFor = () => 7;

beforeEach(() => {
  mocks.get.mockReset();
  mocks.readCached.mockReset();
  mocks.readCached.mockResolvedValue(new Map());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAbyssalAssetEstimates', () => {
  it('takes cached estimates first and looks up only the rest, abyssal items only', async () => {
    mocks.readCached.mockResolvedValue(new Map([[1, estimate('priced', 100)]]));
    mocks.get.mockResolvedValue(estimate('priced', 50));
    const assets = [neut(1), neut(2), { item_id: 3, type_id: TRIT }];
    const { result } = renderHook(() => useAbyssalAssetEstimates(assets, characterIdFor));
    await waitFor(() => expect(result.current.values.size).toBe(2));
    expect(mocks.readCached).toHaveBeenCalledWith([1, 2]);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith(NEUT, 2, { characterId: 7 });
    expect([...result.current.values]).toEqual([
      [1, 100],
      [2, 50],
    ]);
  });

  it('stops looking up in the background once MutaMarket is unavailable', async () => {
    mocks.get.mockResolvedValue(estimate('unavailable'));
    const assets = Array.from({ length: 20 }, (_, i) => neut(i + 1));
    const { result } = renderHook(() => useAbyssalAssetEstimates(assets, characterIdFor));
    await waitFor(() => expect(result.current.estimates.size).toBeGreaterThan(0));
    // The four workers each finish the lookup they had started, then stop.
    expect(mocks.get.mock.calls.length).toBeLessThanOrEqual(4);
    expect(result.current.values.size).toBe(0);
    // Nor does a row on screen ask, while MutaMarket can't be reached.
    const calls = mocks.get.mock.calls.length;
    act(() => result.current.request({ itemId: 20, typeId: NEUT }));
    expect(mocks.get).toHaveBeenCalledTimes(calls);
  });

  it('picks up an estimate asked for elsewhere (an import from Item Detail)', async () => {
    mocks.get.mockResolvedValue(estimate('not-imported'));
    const { result } = renderHook(() => useAbyssalAssetEstimates([neut(1)], characterIdFor));
    await waitFor(() => expect(result.current.estimates.get(1)?.status).toBe('not-imported'));
    act(() => {
      for (const listener of mocks.listeners) listener(1, estimate('priced', 70));
    });
    await waitFor(() => expect(result.current.values.get(1)).toBe(70));
  });

  it('caps the background queue, and a row on screen asks past it', async () => {
    mocks.get.mockResolvedValue(estimate('no-estimate'));
    const count = ABYSSAL_BACKGROUND_LOOKUPS + 5;
    const assets = Array.from({ length: count }, (_, i) => neut(i + 1));
    const { result } = renderHook(() => useAbyssalAssetEstimates(assets, characterIdFor));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(ABYSSAL_BACKGROUND_LOOKUPS));
    act(() => result.current.request({ itemId: count, typeId: NEUT }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(ABYSSAL_BACKGROUND_LOOKUPS + 1));
    expect(mocks.get).toHaveBeenLastCalledWith(NEUT, count, { characterId: 7 });
    act(() => result.current.request({ itemId: count, typeId: NEUT }));
    expect(mocks.get).toHaveBeenCalledTimes(ABYSSAL_BACKGROUND_LOOKUPS + 1);
  });

  it('pauses row asks after a row gets unavailable, and lets them retry after the pause', async () => {
    mocks.get.mockResolvedValue(estimate('unavailable'));
    const { result } = renderHook(() => useAbyssalAssetEstimates([], characterIdFor));
    act(() => {
      result.current.request({ itemId: 1, typeId: NEUT });
    });
    await waitFor(() => expect(result.current.estimates.get(1)?.status).toBe('unavailable'));
    act(() => {
      result.current.request({ itemId: 2, typeId: NEUT });
    });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    const later = Date.now() + 5 * 60 * 1000 + 1;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    act(() => {
      result.current.request({ itemId: 1, typeId: NEUT });
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenLastCalledWith(NEUT, 1, { characterId: 7 });
  });

  it('holds the background cap when the asset list is rebuilt, and resets it for a new scope', async () => {
    mocks.get.mockResolvedValue(estimate('no-estimate'));
    const count = ABYSSAL_BACKGROUND_LOOKUPS + 5;
    const assets = Array.from({ length: count }, (_, i) => neut(i + 1));
    const { rerender } = renderHook(
      ({ list, scope }) => useAbyssalAssetEstimates(list, characterIdFor, scope),
      { initialProps: { list: assets, scope: 'a' } }
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(ABYSSAL_BACKGROUND_LOOKUPS));
    rerender({ list: [...assets], scope: 'a' });
    await waitFor(() => expect(mocks.readCached).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.get).toHaveBeenCalledTimes(ABYSSAL_BACKGROUND_LOOKUPS);
    rerender({ list: [...assets], scope: 'b' });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(count));
  });

  it('drops queued row asks on unmount', async () => {
    const hanging: ((value: AbyssalEstimate) => void)[] = [];
    mocks.get.mockImplementation(
      () => new Promise<AbyssalEstimate>((resolve) => hanging.push(resolve))
    );
    const { result, unmount } = renderHook(() => useAbyssalAssetEstimates([], characterIdFor));
    act(() => {
      for (let id = 1; id <= 6; id += 1) result.current.request({ itemId: id, typeId: NEUT });
    });
    // Four in flight, two queued behind them.
    expect(mocks.get).toHaveBeenCalledTimes(4);
    unmount();
    await act(async () => {
      for (const resolve of hanging) resolve(estimate('no-estimate'));
      await Promise.resolve();
    });
    expect(mocks.get).toHaveBeenCalledTimes(4);
  });

  it('drops a row ask when the row leaves the screen before its turn', () => {
    mocks.get.mockImplementation(() => new Promise<AbyssalEstimate>(() => {}));
    const { result } = renderHook(() => useAbyssalAssetEstimates([], characterIdFor));
    let cancel = () => {};
    act(() => {
      for (let id = 1; id <= 4; id += 1) result.current.request({ itemId: id, typeId: NEUT });
      cancel = result.current.request({ itemId: 5, typeId: NEUT });
    });
    cancel();
    expect(mocks.get).toHaveBeenCalledTimes(4);
    expect(mocks.get).not.toHaveBeenCalledWith(NEUT, 5, { characterId: 7 });
  });
});
