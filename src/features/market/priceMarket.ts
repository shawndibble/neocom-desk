/**
 * Which market Item Detail's Best sell / Best buy were read from, so the
 * figures say where they are true. Pilots live all over New Eden, far from the
 * hubs, so an unlabelled price would read as "my market".
 *
 * Trade Hub mode names the hub's station ("Jita 4-4"), since the book is
 * filtered to it. Region mode names the region the book was read from: a
 * Global Market Region when the item trades in one (it wins over the pick,
 * `resolveOrderBookRegion`), else the picked region. A region no hub sits in
 * comes back nameless, for the caller to look up (`loadRegionName`).
 */
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
