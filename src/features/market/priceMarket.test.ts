import { describe, expect, it } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import { priceMarketOf } from './priceMarket';
import type { OrderBookLocation } from './orderBookView';

const JITA = TRADE_HUBS[0];
const AMARR = TRADE_HUBS.find((hub) => hub.id === 'amarr')!;

function location(overrides: Partial<OrderBookLocation>): OrderBookLocation {
  return {
    mode: 'hub',
    regionId: JITA.regionId,
    hubStationId: JITA.stationId,
    globalMarkets: new Map(),
    ...overrides,
  };
}

describe('priceMarketOf', () => {
  it('names the Trade Hub station in Trade Hub mode', () => {
    expect(
      priceMarketOf(1, location({ hubStationId: AMARR.stationId, regionId: AMARR.regionId }))
    ).toEqual({ kind: 'hub', name: 'Amarr VIII' });
  });

  it("names the region in Region mode, from a hub's region when it is one", () => {
    expect(priceMarketOf(1, location({ mode: 'region', regionId: AMARR.regionId }))).toEqual({
      kind: 'region',
      regionId: AMARR.regionId,
      name: 'Domain',
    });
  });

  it('leaves a region no hub sits in to be looked up', () => {
    expect(priceMarketOf(1, location({ mode: 'region', regionId: 10000060 }))).toEqual({
      kind: 'region',
      regionId: 10000060,
      name: null,
    });
  });

  it('names a Global Market Region, which wins over the picked region', () => {
    const globalMarkets = new Map([
      [44992, { regionId: 19000001, regionName: 'Global PLEX Market' }],
    ]);
    expect(priceMarketOf(44992, location({ mode: 'region', globalMarkets }))).toEqual({
      kind: 'region',
      regionId: 19000001,
      name: 'Global PLEX Market',
    });
  });
});
