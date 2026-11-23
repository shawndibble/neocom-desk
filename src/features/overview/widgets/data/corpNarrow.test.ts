import { describe, expect, it } from 'vitest';
import { narrowFeedsToCorporation } from './corpNarrow';
import type { Feeds } from './types';

const label = (n: number) => ({ ticker: `T${n}`, name: `Corp ${n}` });
const state = <T>(data: T) => ({ data, error: false, loading: false });

describe('narrowFeedsToCorporation', () => {
  it('keeps one corporation of a per-corporation read', () => {
    const feeds = {
      corpJobsAll: state({
        corporations: [
          { corporationId: 1, feed: { readable: true } },
          { corporationId: 2, feed: { readable: true } },
        ],
        labels: new Map([
          [1, label(1)],
          [2, label(2)],
        ]),
        partlyFailed: false,
      }),
    } as unknown as Feeds;
    const out = narrowFeedsToCorporation(feeds, 2);
    expect(out.corpJobsAll?.data?.corporations.map((c) => c.corporationId)).toEqual([2]);
    // The shared store is not touched.
    expect(feeds.corpJobsAll?.data?.corporations).toHaveLength(2);
  });

  it('keeps one corporation of Due soon', () => {
    const feeds = {
      corpDeadlinesAll: state({
        corporations: [{ corporationId: 1 }, { corporationId: 2 }],
        labels: new Map(),
      }),
    } as unknown as Feeds;
    expect(
      narrowFeedsToCorporation(feeds, 1).corpDeadlinesAll?.data?.corporations.map(
        (c) => c.corporationId
      )
    ).toEqual([1]);
  });

  it('keeps the rows of a merged read that belong to the corporation, and only its label', () => {
    const feeds = {
      corpOrdersAll: state({
        readable: true,
        orders: [{ order_id: 10 }, { order_id: 11 }, { order_id: 12 }],
        corporationOf: new Map([
          ['10', 1],
          ['11', 2],
          ['12', 2],
        ]),
        corporations: new Map([
          [1, label(1)],
          [2, label(2)],
        ]),
      }),
    } as unknown as Feeds;
    const data = narrowFeedsToCorporation(feeds, 2).corpOrdersAll?.data;
    expect(data?.orders.map((o) => o.order_id)).toEqual([11, 12]);
    expect([...(data?.corporations?.keys() ?? [])]).toEqual([2]);
    expect([...(data?.corporationOf?.keys() ?? [])]).toEqual(['11', '12']);
  });

  it('narrows structures and moon drills by their corporation', () => {
    const feeds = {
      structuresAll: state({
        structures: [{ corporationId: 1 }, { corporationId: 2 }],
        corporations: new Map([
          [1, label(1)],
          [2, label(2)],
        ]),
      }),
      moonChunksAll: state({
        chunks: [
          { id: '7', corporation: { id: 1 } },
          { id: '8', corporation: { id: 2 } },
        ],
        extractions: [{ structureId: 7 }, { structureId: 8 }],
      }),
    } as unknown as Feeds;
    const out = narrowFeedsToCorporation(feeds, 2);
    expect(out.structuresAll?.data?.structures).toEqual([{ corporationId: 2 }]);
    expect(out.moonChunksAll?.data?.chunks?.map((c) => c.id)).toEqual(['8']);
    expect(out.moonChunksAll?.data?.extractions?.map((e) => e.structureId)).toEqual([8]);
  });

  it('leaves reads that are not across corporations, and unread feeds, alone', () => {
    const wallet = state({ readable: true });
    const feeds = {
      corpWallet: wallet,
      corpJobsAll: { data: null, error: false, loading: true },
    } as unknown as Feeds;
    const out = narrowFeedsToCorporation(feeds, 1);
    expect(out.corpWallet).toBe(wallet);
    expect(out.corpJobsAll?.data).toBeNull();
  });
});
