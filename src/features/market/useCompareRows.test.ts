import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCompareRows, type CompareRow, type UseCompareRowsArgs } from './useCompareRows';
import { getOrderBook, type OrderBookResult } from './orderBook';
import type { RegionOrder } from '@/esi/endpoints';

vi.mock('./orderBook', () => ({ getOrderBook: vi.fn() }));

const mockedGetOrderBook = vi.mocked(getOrderBook);

const ITEM_A = { typeId: 34, itemName: 'Tritanium' };
const ITEM_B = { typeId: 35, itemName: 'Pyerite' };

const baseArgs: Omit<UseCompareRowsArgs, 'items' | 'enabled'> = {
  chosenRegionId: 10000002,
  globalMarkets: new Map(),
  locationMode: 'region',
  hubStationId: 60003760,
  refreshTick: 0,
};

/** Minimal-but-complete RegionOrder, so each test only spells out what it cares about. */
function regionOrder(overrides: Partial<RegionOrder>): RegionOrder {
  return {
    order_id: 1,
    type_id: ITEM_A.typeId,
    is_buy_order: false,
    price: 0,
    location_id: 0,
    system_id: 0,
    volume_remain: 0,
    volume_total: 0,
    min_volume: 1,
    duration: 90,
    issued: '2026-08-01T00:00:00Z',
    range: 'region',
    ...overrides,
  };
}

function orderBookResult(orders: RegionOrder[]): OrderBookResult {
  return { orders, truncated: false, fetchedAt: 0 };
}

beforeEach(() => {
  mockedGetOrderBook.mockReset();
});

describe('useCompareRows', () => {
  it('does not fetch anything while disabled', () => {
    renderHook(() => useCompareRows({ items: [ITEM_A], enabled: false, ...baseArgs }));
    expect(mockedGetOrderBook).not.toHaveBeenCalled();
  });

  it('does not fetch when the set is empty', () => {
    renderHook(() => useCompareRows({ items: [], enabled: true, ...baseArgs }));
    expect(mockedGetOrderBook).not.toHaveBeenCalled();
  });

  it('fetches each item and summarizes its order book once enabled', async () => {
    mockedGetOrderBook.mockImplementation(async (_regionId, typeId) =>
      orderBookResult(
        typeId === ITEM_A.typeId
          ? [
              regionOrder({ order_id: 1, is_buy_order: false, price: 5, volume_remain: 100 }),
              regionOrder({ order_id: 2, is_buy_order: true, price: 4, volume_remain: 50 }),
            ]
          : [regionOrder({ order_id: 3, is_buy_order: false, price: 900, volume_remain: 10 })]
      )
    );

    const { result } = renderHook(() =>
      useCompareRows({ items: [ITEM_A, ITEM_B], enabled: true, ...baseArgs })
    );

    await waitFor(() => expect(result.current.every((row) => !row.loading)).toBe(true));

    expect(result.current).toEqual([
      {
        typeId: ITEM_A.typeId,
        itemName: ITEM_A.itemName,
        loading: false,
        summary: { bestSell: 5, bestBuy: 4, spread: 1, availableVolume: 100 },
      },
      {
        typeId: ITEM_B.typeId,
        itemName: ITEM_B.itemName,
        loading: false,
        summary: { bestSell: 900, bestBuy: null, spread: null, availableVolume: 10 },
      },
    ]);
  });

  it('filters to the hub station when Location Mode is hub', async () => {
    mockedGetOrderBook.mockResolvedValue(
      orderBookResult([
        regionOrder({ order_id: 1, price: 5, volume_remain: 100, location_id: 60003760 }),
        regionOrder({ order_id: 2, price: 1, volume_remain: 999, location_id: 60008494 }),
      ])
    );

    const { result } = renderHook(() =>
      useCompareRows({
        items: [ITEM_A],
        enabled: true,
        ...baseArgs,
        locationMode: 'hub',
      })
    );

    await waitFor(() => expect(result.current[0]?.loading).toBe(false));
    expect(result.current[0]?.summary).toEqual({
      bestSell: 5,
      bestBuy: null,
      spread: null,
      availableVolume: 100,
    });
  });

  it('discards a stale response when Location Mode changes mid-flight', async () => {
    let resolveFirst!: (value: OrderBookResult) => void;
    mockedGetOrderBook.mockImplementationOnce(
      () =>
        new Promise<OrderBookResult>((resolve) => {
          resolveFirst = resolve;
        })
    );
    mockedGetOrderBook.mockResolvedValueOnce(
      orderBookResult([
        regionOrder({
          order_id: 1,
          price: 7,
          volume_remain: 1,
          location_id: baseArgs.hubStationId,
        }),
      ])
    );

    const { result, rerender } = renderHook<CompareRow[], UseCompareRowsArgs>(
      (props) => useCompareRows(props),
      { initialProps: { items: [ITEM_A], enabled: true, ...baseArgs } }
    );

    rerender({ items: [ITEM_A], enabled: true, ...baseArgs, locationMode: 'hub' });

    await waitFor(() => expect(result.current[0]?.loading).toBe(false));
    expect(result.current[0]?.summary).toEqual({
      bestSell: 7,
      bestBuy: null,
      spread: null,
      availableVolume: 1,
    });

    // The stale first call resolving afterward must not clobber the current rows.
    resolveFirst(orderBookResult([regionOrder({ order_id: 2, price: 999, volume_remain: 1 })]));
    await Promise.resolve();
    expect(result.current[0]?.summary?.bestSell).toBe(7);
  });
});
