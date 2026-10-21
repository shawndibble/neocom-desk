import { describe, expect, it } from 'vitest';
import type { CorporationOrder } from '@/esi/endpoints';
import { corpOrders } from './corpOrdersModels';
import type { CorpOrdersFeed } from './corpFeeds';
import type { BuildContext, FeedState, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const ctx = { t, now: NOW, range: 30, activeCharacterId: 1 } as unknown as BuildContext;
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const STATION = 60003760;

const order = (id: number, over: Partial<CorporationOrder> = {}): CorporationOrder => ({
  order_id: id,
  type_id: 34,
  region_id: 10000002,
  location_id: STATION,
  is_buy_order: false,
  issued_by: 7,
  price: 100,
  volume_remain: 10,
  volume_total: 20,
  issued: new Date(NOW - 86_400_000).toISOString(),
  duration: 90,
  range: 'station',
  ...over,
});

const feed = (orders: CorporationOrder[], over: Partial<CorpOrdersFeed> = {}): Feeds => ({
  corpOrders: ok<CorpOrdersFeed>({
    readable: true,
    needsReauth: false,
    fetchedAt: new Date(NOW),
    fromCache: false,
    orders,
    typeNames: new Map([[34, 'Tritanium']]),
    stationNames: new Map([[STATION, 'Jita IV - Moon 4']]),
    // Best rival sells at 90: a sell order at 100 is undercut.
    stationPrices: new Map([[`${STATION}:34`, { sellMin: 90, buyMax: 50 } as never]]),
    issuerNames: new Map([[7, 'Efa Astrahus']]),
    ...over,
  }),
});

describe('corpOrders', () => {
  it('is blank while the feed is missing, and unreadable keeps its own message', () => {
    expect(corpOrders({}, ctx).status.hasData).toBe(false);
    const view = corpOrders(feed([], { readable: false, needsReauth: true }), ctx);
    expect(view.status.needsPermission).toBe(true);
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('links its title to the Market orders Corp view', () => {
    expect(corpOrders(feed([order(1)]), ctx).to).toBe('/market/orders?scope=corp');
    expect(corpOrders(feed([], { readable: false }), ctx).to).toBe('/market/orders?scope=corp');
  });

  it('counts open orders, sums escrow and flags the undercut one', () => {
    const view = corpOrders(
      feed([
        order(1),
        order(2, { is_buy_order: true, price: 40, escrow: 400 }),
        order(3, { price: 80, issued_by: 8 }),
      ]),
      ctx
    );
    expect(view.number?.value).toBe('3');
    expect(view.number?.secondary?.text).toContain('overview.widgets.corpOrders.escrow');
    expect(view.number?.tone).toBe('warning');
    expect(view.summary).toContain('"undercut":1');
  });

  it('adds an issued-by column, naming who placed each order', () => {
    const view = corpOrders(feed([order(1), order(2, { issued_by: 8 })]), ctx);
    const columns = view.table?.columns.map((c) => c.key);
    expect(columns).toEqual(['item', 'side', 'price', 'vsBest', 'expires', 'issuedBy', 'station']);
    const byKey = new Map(view.table?.rows.map((r) => [r.key, r.cells[5]]));
    expect(byKey.get('1')).toBe('Efa Astrahus');
    // An issuer ESI could not name shows as unknown, never as a wrong name.
    expect(byKey.get('2')).not.toBe('Efa Astrahus');
    expect(view.table?.rows.every((r) => r.cells.length === columns?.length)).toBe(true);
  });

  it('is empty, not zero-undercut, with no orders', () => {
    const view = corpOrders(feed([]), ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.number?.value).toBe('0');
  });
});
