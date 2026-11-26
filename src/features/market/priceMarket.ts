import { resolveOrderBookRegion } from '@/engine/market/locationMode';
import { TRADE_HUBS } from '@/market/hubs';
import type { OrderBookLocation } from './orderBookView';

export type PriceMarket =
  { kind: 'hub'; name: string } | { kind: 'region'; regionId: number; name: string | null };

export function priceMarketOf(typeId: number, location: OrderBookLocation): PriceMarket {
  if (location.mode === 'hub') {
    const hub = TRADE_HUBS.find((candidate) => candidate.stationId === location.hubStationId);
    if (hub) return { kind: 'hub', name: hub.stationLabel };
  }
  const region = resolveOrderBookRegion(typeId, location.regionId, location.globalMarkets);
  const name =
    region.override?.regionName ??
    TRADE_HUBS.find((hub) => hub.regionId === region.regionId)?.regionName ??
    null;
  return { kind: 'region', regionId: region.regionId, name };
}
