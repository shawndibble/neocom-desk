import { DAY_MS } from '@/lib/age';

export interface RawOrder {
  is_buy_order: boolean;
}

export interface OrderBook<T extends RawOrder> {
  sell: T[];
  buy: T[];
}

export function splitOrderBook<T extends RawOrder>(orders: readonly T[]): OrderBook<T> {
  const sell: T[] = [];
  const buy: T[] = [];
  for (const order of orders) (order.is_buy_order ? buy : sell).push(order);
  return { sell, buy };
}

export interface NpcStationLookup {
  name: string;
  systemId: number;
}

export interface SolarSystemLookup {
  name: string;
  security: number;
}

export interface ResolvedOrderLocation {
  stationName: string | null;
  systemName: string;
  security: number;
}

export function resolveOrderLocation(
  order: { location_id: number; system_id: number },
  npcStations: ReadonlyMap<number, NpcStationLookup>,
  solarSystems: ReadonlyMap<number, SolarSystemLookup>
): ResolvedOrderLocation {
  const station = npcStations.get(order.location_id);
  const systemId = station?.systemId ?? order.system_id;
  const system = solarSystems.get(systemId);
  return {
    stationName: station?.name ?? null,
    systemName: system?.name ?? '',
    security: system?.security ?? 0,
  };
}

export function filterOrdersByLocation<T extends { location_id: number }>(
  orders: readonly T[],
  locationId: number | null
): T[] {
  if (locationId === null) return [...orders];
  return orders.filter((order) => order.location_id === locationId);
}

export interface OrderBookSummary {
  bestSell: number | null;
  bestBuy: number | null;
  spread: number | null;
  availableVolume: number;
}

interface PricedOrder extends RawOrder {
  price: number;
  volume_remain: number;
}

export function summarizeOrderBook<T extends PricedOrder>(orders: readonly T[]): OrderBookSummary {
  const { sell, buy } = splitOrderBook(orders);
  const bestSell = sell.length === 0 ? null : Math.min(...sell.map((o) => o.price));
  const bestBuy = buy.length === 0 ? null : Math.max(...buy.map((o) => o.price));
  return {
    bestSell,
    bestBuy,
    spread: bestSell === null || bestBuy === null ? null : bestSell - bestBuy,
    availableVolume: sell.reduce((total, o) => total + o.volume_remain, 0),
  };
}

export function orderExpiry(order: { issued: string; duration: number }): Date {
  const issued = new Date(order.issued);
  return new Date(issued.getTime() + order.duration * DAY_MS);
}
