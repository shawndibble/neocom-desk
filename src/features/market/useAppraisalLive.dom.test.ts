import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';
import { DEFAULT_TRADE_HUB, TRADE_HUBS } from '@/market/hubs';
import type { AppraisalOutcome, HubComparisonRow } from './appraisalData';
import { useAppraisalLive } from './useAppraisalLive';
import type { LiveBook, LiveBookRequest } from './liveBooks';

const loadLiveBooks = vi.hoisted(() => vi.fn());
const peekLiveBook = vi.hoisted(() => vi.fn());
const loadOrders = vi.hoisted(() => vi.fn());
vi.mock('./liveBooks', () => ({ loadLiveBooks, peekLiveBook }));
vi.mock('./openOrdersData', () => ({ loadAllCharactersOpenOrders: loadOrders }));

const hub = DEFAULT_TRADE_HUB;
const ITEMS: AppraisalItem[] = [
  { typeId: 1, name: 'Cheap', quantity: 1, buy: 1, sell: 2 },
  { typeId: 2, name: 'Dear', quantity: 10, buy: 90, sell: 100 },
];

function outcome(items: AppraisalItem[] = ITEMS): AppraisalOutcome {
  return {
    appraisal: buildAppraisal(items, 100),
    unmatched: [],
    implantBonusPct: 0,
    refinesOreOrIce: false,
    accountingLevel: null,
    brokerRelationsLevel: null,
    pricesUnreachable: false,
  };
}

const book = (orderId: number, price: number): LiveBook => ({
  fetchedAt: 1_000,
  orders: [{ order_id: orderId, is_buy_order: false, location_id: hub.stationId, price }],
});

beforeEach(() => {
  loadLiveBooks.mockReset();
  peekLiveBook.mockReset();
  peekLiveBook.mockReturnValue(undefined);
  loadOrders.mockReset();
  loadOrders.mockResolvedValue({ entries: [{ orders: [{ order_id: 77 }] }] });
});

describe('useAppraisalLive', () => {
  it('goes live most valuable row first and marks a failed row', async () => {
    const order: number[] = [];
    loadLiveBooks.mockImplementation(
      async (
        requests: LiveBookRequest[],
        onSettled: (r: LiveBookRequest, b: LiveBook | 'failed') => void
      ) => {
        for (const request of requests) {
          order.push(request.typeId);
          onSettled(request, request.typeId === 2 ? book(5, 95) : 'failed');
        }
      }
    );
    const base = outcome();
    const { result } = renderHook(() =>
      useAppraisalLive({ base, baseCompare: null, hub, pricePercent: 100, compareOpen: false })
    );

    await waitFor(() => expect(result.current.live.checking).toBe(false));
    expect(order).toEqual([2, 1]);
    const rows = result.current.result?.appraisal.rows ?? [];
    expect(rows.find((r) => r.typeId === 2)).toMatchObject({ sellEach: 95, priceState: 'live' });
    expect(rows.find((r) => r.typeId === 1)).toMatchObject({ sellEach: 2, priceState: 'failed' });
    expect(result.current.live).toMatchObject({ done: 2, total: 2, failed: 1 });
  });

  it('matches the pilot own cheapest order in the merged items', async () => {
    loadLiveBooks.mockImplementation(
      async (
        requests: LiveBookRequest[],
        onSettled: (r: LiveBookRequest, b: LiveBook | 'failed') => void
      ) => {
        for (const request of requests) onSettled(request, book(77, 50));
      }
    );
    const base = outcome();
    const { result } = renderHook(() =>
      useAppraisalLive({ base, baseCompare: null, hub, pricePercent: 100, compareOpen: false })
    );
    await waitFor(() => expect(result.current.live.checking).toBe(false));
    expect(result.current.result?.appraisal.items.every((i) => i.sellIsOwn)).toBe(true);
  });

  it('makes no request when every book is cached', async () => {
    peekLiveBook.mockReturnValue(book(5, 95));
    const base = outcome();
    const { result } = renderHook(() =>
      useAppraisalLive({ base, baseCompare: null, hub, pricePercent: 100, compareOpen: false })
    );
    await waitFor(() => expect(result.current.live.done).toBe(2));
    expect(loadLiveBooks.mock.calls.every(([wanted]) => wanted.length === 0)).toBe(true);
    expect(result.current.live.checking).toBe(false);
  });

  it('settle waits for the in-flight run and returns live rows', async () => {
    let release: () => void = () => {};
    loadLiveBooks.mockImplementation(
      (
        requests: LiveBookRequest[],
        onSettled: (r: LiveBookRequest, b: LiveBook | 'failed') => void
      ) =>
        new Promise<void>((resolve) => {
          release = () => {
            for (const request of requests) onSettled(request, book(5, 95));
            resolve();
          };
        })
    );
    const base = outcome();
    const { result } = renderHook(() =>
      useAppraisalLive({ base, baseCompare: null, hub, pricePercent: 100, compareOpen: false })
    );
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalled());
    await waitFor(() => expect(result.current.live.checking).toBe(true));
    let settled: AppraisalOutcome | null = null;
    const pending = result.current.settle().then((r) => (settled = r));
    expect(settled).toBeNull();
    await act(async () => {
      release();
      await pending;
    });
    expect(settled).not.toBeNull();
    expect(
      (settled as unknown as AppraisalOutcome).appraisal.items.map((i) => i.priceState)
    ).toEqual(['live', 'live']);
  });

  it('fetches the other four hubs only once Compare Hubs is open', async () => {
    loadLiveBooks.mockResolvedValue(undefined);
    const baseCompare: HubComparisonRow[] = TRADE_HUBS.map((h) => ({
      hub: h,
      buy: 1,
      sell: 2,
      unreachable: false,
      items: ITEMS,
    }));
    const base = outcome();
    const { rerender } = renderHook(
      ({ open }) =>
        useAppraisalLive({ base, baseCompare, hub, pricePercent: 100, compareOpen: open }),
      { initialProps: { open: false } }
    );
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(1));
    rerender({ open: true });
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(2));
    const requests = loadLiveBooks.mock.calls[1][0] as LiveBookRequest[];
    expect(requests).toHaveLength(8);
    expect(requests.some((r) => r.hub.id === hub.id)).toBe(false);
  });
  it('tells a superseded run to stop, and refetches after Compare closes and reopens', async () => {
    loadLiveBooks.mockImplementation(() => new Promise<void>(() => {}));
    const baseCompare: HubComparisonRow[] = TRADE_HUBS.map((h) => ({
      hub: h,
      buy: 1,
      sell: 2,
      unreachable: false,
      items: ITEMS,
    }));
    const base = outcome();
    const other = TRADE_HUBS.find((h) => h.id !== hub.id)!;
    const { rerender } = renderHook(
      ({ open, h }) =>
        useAppraisalLive({ base, baseCompare, hub: h, pricePercent: 100, compareOpen: open }),
      { initialProps: { open: false, h: hub } }
    );
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(1));
    const firstRun = loadLiveBooks.mock.calls[0][2].isCancelled as () => boolean;
    expect(firstRun()).toBe(false);
    rerender({ open: false, h: other });
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(2));
    expect(firstRun()).toBe(true);

    rerender({ open: true, h: other });
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(3));
    const compareRun = loadLiveBooks.mock.calls[2][2].isCancelled as () => boolean;
    expect(compareRun()).toBe(false);
    rerender({ open: false, h: other });
    expect(compareRun()).toBe(true);
    rerender({ open: true, h: other });
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(4));
    expect((loadLiveBooks.mock.calls[3][2].isCancelled as () => boolean)()).toBe(false);
  });

  it('fetches books while the own orders load, and shows no live row until both are in', async () => {
    let releaseOwn: (value: unknown) => void = () => {};
    loadOrders.mockReturnValue(new Promise((resolve) => (releaseOwn = resolve)));
    loadLiveBooks.mockImplementation(
      async (
        requests: LiveBookRequest[],
        onSettled: (r: LiveBookRequest, b: LiveBook | 'failed') => void
      ) => {
        for (const request of requests) onSettled(request, book(77, 50));
      }
    );
    const base = outcome();
    const { result } = renderHook(() =>
      useAppraisalLive({ base, baseCompare: null, hub, pricePercent: 100, compareOpen: false })
    );
    await waitFor(() => expect(result.current.live.done).toBe(2));
    expect(loadLiveBooks).toHaveBeenCalled();
    expect(result.current.live.checking).toBe(true);
    expect(result.current.result?.appraisal.items.some((i) => i.priceState === 'live')).toBe(false);
    await act(async () => {
      releaseOwn({ entries: [{ orders: [{ order_id: 77 }] }] });
    });
    await waitFor(() => expect(result.current.live.checking).toBe(false));
    expect(result.current.result?.appraisal.items.every((i) => i.sellIsOwn)).toBe(true);
  });

  it('stops checking when the base goes away', async () => {
    loadLiveBooks.mockImplementation(() => new Promise<void>(() => {}));
    const base = outcome();
    const { result, rerender } = renderHook(
      ({ b }: { b: AppraisalOutcome | null }) =>
        useAppraisalLive({
          base: b,
          baseCompare: null,
          hub,
          pricePercent: 100,
          compareOpen: false,
        }),
      { initialProps: { b: base as AppraisalOutcome | null } }
    );
    await waitFor(() => expect(result.current.live.checking).toBe(true));
    rerender({ b: null });
    expect(result.current.live.checking).toBe(false);
    await expect(result.current.settle()).resolves.toBeNull();
  });

  it('applies a Refresh force to the next base only, not to a re-run of the same one', async () => {
    loadLiveBooks.mockResolvedValue(undefined);
    const base = outcome();
    const next = outcome();
    const other = TRADE_HUBS.find((h) => h.id !== hub.id)!;
    const { result, rerender } = renderHook(
      ({ b, h }) =>
        useAppraisalLive({
          base: b,
          baseCompare: null,
          hub: h,
          pricePercent: 100,
          compareOpen: false,
        }),
      { initialProps: { b: base, h: hub } }
    );
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(1));
    act(() => result.current.forceNextRun());
    rerender({ b: base, h: other });
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(2));
    expect(loadLiveBooks.mock.calls[1][2].force).toBe(false);
    rerender({ b: next, h: other });
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(3));
    expect(loadLiveBooks.mock.calls[2][2].force).toBe(true);
    rerender({ b: outcome(), h: other });
    await waitFor(() => expect(loadLiveBooks).toHaveBeenCalledTimes(4));
    expect(loadLiveBooks.mock.calls[3][2].force).toBe(false);
  });
});
