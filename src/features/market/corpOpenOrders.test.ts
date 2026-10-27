import { describe, expect, it } from 'vitest';
import type { CorporationOrder } from '@/esi/endpoints';
import type { CorpOrdersFeed } from '@/features/overview/widgets/data/corpFeeds';
import { corpOrderRows, corpOrdersSnapshot } from './corpOpenOrders';

const NOW = Date.parse('2026-10-20T12:00:00Z');
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

const feed = (orders: CorporationOrder[], over: Partial<CorpOrdersFeed> = {}): CorpOrdersFeed => ({
  readable: true,
  needsReauth: false,
  fetchedAt: new Date(NOW),
  fromCache: false,
  orders,
  typeNames: new Map([[34, 'Tritanium']]),
  stationNames: new Map([[STATION, 'Jita IV - Moon 4']]),
  // Best rival sells at 90: a sell order at 100 is undercut.
  stationPrices: new Map([[`${STATION}:34`, { sellMin: 90, buyMax: 50 } as never]]),
  issuerNames: new Map([
    [7, 'Efa Astrahus'],
    [8, 'Bea Astrahus'],
  ]),
  ...over,
});

describe('corpOrdersSnapshot', () => {
  it('groups orders by issuer, one entry each, named by the resolved issuer', () => {
    const snap = corpOrdersSnapshot(feed([order(1), order(2, { issued_by: 8 }), order(3)]), NOW);
    expect(snap.openOrders.entries.map((e) => [e.characterId, e.characterName])).toEqual([
      [7, 'Efa Astrahus'],
      [8, 'Bea Astrahus'],
    ]);
    expect(snap.openOrders.entries[0]!.orders.map((o) => o.order_id)).toEqual([1, 3]);
    expect(snap.openOrders.skipped).toEqual([]);
  });

  it('keeps an issuer ESI could not name as a blank-named entry, never a wrong name', () => {
    const snap = corpOrdersSnapshot(feed([order(1, { issued_by: 99 })]), NOW);
    expect(snap.openOrders.entries[0]!.characterName).toBe('');
  });

  it('has no cost basis, skills or standings: the corporation has none', () => {
    const snap = corpOrdersSnapshot(feed([order(1)]), NOW);
    expect(snap.costBases.size).toBe(0);
    expect(snap.skillsByCharacter.size).toBe(0);
    expect(snap.standingsByOrder.size).toBe(0);
    expect(snap.problemSamples.size).toBe(0);
  });

  it('carries the feed age and the reauth flag', () => {
    const snap = corpOrdersSnapshot(feed([order(1)], { fromCache: true }), NOW);
    expect(snap.openOrders.entries[0]!.fetchedAt).toBe(NOW);
    expect(snap.openOrders.entries[0]!.fromCache).toBe(true);
    expect(
      corpOrdersSnapshot(feed([], { needsReauth: true, readable: false }), NOW).corporation
    ).toEqual({
      needsReauth: true,
    });
  });
});

describe('corpOrderRows', () => {
  it('judges undercut by the station tier, as for a Character, with no floor or basis', () => {
    const [row] = corpOrderRows(feed([order(1)]), NOW);
    expect(row!.problem).toBe('undercutStation');
    expect(row!.floor).toBeNull();
    expect(row!.costBasis).toBeNull();
    expect(row!.characterName).toBe('Efa Astrahus');
    expect(row!.stationName).toBe('Jita IV - Moon 4');
  });
});
