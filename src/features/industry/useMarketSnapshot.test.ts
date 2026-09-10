import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMarketSnapshot } from './useMarketSnapshot';
import { loadMarketSnapshot, type MarketSnapshot } from './marketData';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';

vi.mock('./marketData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./marketData')>();
  return { ...actual, loadMarketSnapshot: vi.fn() };
});

const mockedLoad = vi.mocked(loadMarketSnapshot);

function snapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    hubPrices: {},
    hubBuyPrices: {},
    hubSellVolumes: {},
    adjustedPrices: {},
    systemCostIndex: 0,
    ...overrides,
  };
}

describe('useMarketSnapshot', () => {
  beforeEach(() => {
    mockedLoad.mockReset();
  });

  it('does not fetch and is not loading when there are no type ids', () => {
    const { result } = renderHook(() => useMarketSnapshot(DEFAULT_TRADE_HUB, []));

    expect(result.current.loading).toBe(false);
    expect(result.current.snapshot).toBeNull();
    expect(result.current.fetchedAt).toBeNull();
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('loads and reports the snapshot once resolved', async () => {
    const snap = snapshot({ hubPrices: { 34: 5.5 } });
    mockedLoad.mockResolvedValue(snap);

    const { result } = renderHook(() => useMarketSnapshot(DEFAULT_TRADE_HUB, [34]));
    expect(result.current.loading).toBe(true);
    expect(result.current.snapshot).toBeNull();

    await waitFor(() => expect(result.current.snapshot).toEqual(snap));
    expect(result.current.loading).toBe(false);
    expect(result.current.fetchedAt).toBeInstanceOf(Date);
    expect(mockedLoad).toHaveBeenCalledWith(DEFAULT_TRADE_HUB, [34], undefined, 'manufacturing');
  });

  it('passes costIndexSystemId and activity through to the loader', async () => {
    mockedLoad.mockResolvedValue(snapshot());
    const { result } = renderHook(() =>
      useMarketSnapshot(DEFAULT_TRADE_HUB, [34], 30000144, 'reaction')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedLoad).toHaveBeenCalledWith(DEFAULT_TRADE_HUB, [34], 30000144, 'reaction');
  });

  it('re-enters loading the instant the key changes, in the same render — no stale "ready" frame', async () => {
    mockedLoad.mockResolvedValue(snapshot({ hubPrices: { 34: 1 } }));
    const { result, rerender } = renderHook(
      ({ typeIds }) => useMarketSnapshot(DEFAULT_TRADE_HUB, typeIds),
      { initialProps: { typeIds: [34] } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedLoad.mockResolvedValue(snapshot({ hubPrices: { 35: 2 } }));
    rerender({ typeIds: [35] });

    // Synchronous, render-phase reset: loading flips true before the new
    // fetch has had any chance to resolve.
    expect(result.current.loading).toBe(true);
    await waitFor(() =>
      expect(result.current.snapshot).toEqual(snapshot({ hubPrices: { 35: 2 } }))
    );
  });

  it('keeps the previous snapshot visible while a refetch is in flight (stale-while-loading)', async () => {
    const first = snapshot({ hubPrices: { 34: 1 } });
    mockedLoad.mockResolvedValue(first);
    const { result, rerender } = renderHook(
      ({ tick }) => useMarketSnapshot(DEFAULT_TRADE_HUB, [34], undefined, 'manufacturing', tick),
      { initialProps: { tick: 0 } }
    );
    await waitFor(() => expect(result.current.snapshot).toEqual(first));

    let resolveSecond: (value: MarketSnapshot) => void = () => {};
    mockedLoad.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        })
    );
    rerender({ tick: 1 });

    expect(result.current.loading).toBe(true);
    expect(result.current.snapshot).toEqual(first); // still the old data, not cleared

    const second = snapshot({ hubPrices: { 34: 2 } });
    resolveSecond(second);
    await waitFor(() => expect(result.current.snapshot).toEqual(second));
    expect(result.current.loading).toBe(false);
  });

  it('discards a resolved load whose key has since changed away', async () => {
    let resolveFirst: (value: MarketSnapshot) => void = () => {};
    mockedLoad.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const { result, rerender } = renderHook(
      ({ typeIds }) => useMarketSnapshot(DEFAULT_TRADE_HUB, typeIds),
      { initialProps: { typeIds: [34] } }
    );
    expect(result.current.loading).toBe(true);

    const second = snapshot({ hubPrices: { 35: 9 } });
    mockedLoad.mockResolvedValue(second);
    rerender({ typeIds: [35] });
    await waitFor(() => expect(result.current.snapshot).toEqual(second));

    resolveFirst(snapshot({ hubPrices: { 34: 1 } }));
    await Promise.resolve();
    // The stale [34] response must not overwrite the current [35] result.
    expect(result.current.snapshot).toEqual(second);
  });

  it('refetches when refreshTick changes even though hub/typeIds/activity did not', async () => {
    mockedLoad.mockResolvedValue(snapshot({ hubPrices: { 34: 1 } }));
    const { rerender } = renderHook(
      ({ tick }) => useMarketSnapshot(DEFAULT_TRADE_HUB, [34], undefined, 'manufacturing', tick),
      { initialProps: { tick: 0 } }
    );
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(1));

    rerender({ tick: 1 });
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(2));
  });

  it('re-fetches at a different hub even with the same type ids', async () => {
    mockedLoad.mockResolvedValue(snapshot());
    const jita = getTradeHub('jita')!;
    const amarr = getTradeHub('amarr')!;
    const { rerender } = renderHook(({ hub }) => useMarketSnapshot(hub, [34]), {
      initialProps: { hub: jita },
    });
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(1));

    rerender({ hub: amarr });
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(2));
    expect(mockedLoad).toHaveBeenLastCalledWith(amarr, [34], undefined, 'manufacturing');
  });
});
