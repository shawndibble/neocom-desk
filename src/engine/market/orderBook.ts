/**
 * Order-book reduction (ADR 0003): splitting a region's raw order list into
 * sell/buy, and resolving each order's location to a display-ready station
 * name or "unknown structure" fact. Pure — callers adapt ESI/SDE shapes at
 * the boundary and translate `stationName === null` into copy themselves.
 */

export interface RawOrder {
  is_buy_order: boolean;
}

export interface OrderBook<T extends RawOrder> {
  sell: T[];
  buy: T[];
}

/** Splits a region order book into sell/buy, preserving each side's relative order. */
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
  /** Null when location_id is not a known NPC station — a player structure, never dropped. */
  stationName: string | null;
  systemName: string;
  security: number;
}

/**
 * Resolves an order's location_id against the snapshot's NPC station map. An
 * unresolved location_id is a player structure — its name needs a scope this
 * app does not take (ADR 0003), so the system/security still resolve from
 * the order's own system_id.
 */
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

/**
 * Narrows an order book to one location_id: Trade Hub mode's own-station
 * filter (CONTEXT.md: "filters the rows down to the hub's own station") and
 * the order-row "filter to this station" context-menu action share this
 * function. `null` passes every order through, for the context-menu action's
 * undo.
 */
export function filterOrdersByLocation<T extends { location_id: number }>(
  orders: readonly T[],
  locationId: number | null
): T[] {
  if (locationId === null) return [...orders];
  return orders.filter((order) => order.location_id === locationId);
}

export interface OrderBookSummary {
  /** Cheapest sell order's price; null when the side has no orders. */
  bestSell: number | null;
  /** Highest buy order's price; null when the side has no orders. */
  bestBuy: number | null;
  /** bestSell - bestBuy; null unless both sides have an order — never derived from a missing side treated as zero. */
  spread: number | null;
  /**
   * Sum of sell-side volume_remain: what a buyer could actually acquire right
   * now. Buy-side volume is demand, not supply, so it is not part of this.
   */
  availableVolume: number;
}

interface PricedOrder extends RawOrder {
  price: number;
  volume_remain: number;
}

/** Compare Set summary (CONTEXT.md "Compare"): best sell, best buy, spread and available volume for one item's order book. Pure; callers pass an already location-filtered order list. */
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

/** An order's expiry: issued + duration (days). */
export function orderExpiry(order: { issued: string; duration: number }): Date {
  const issued = new Date(order.issued);
  return new Date(issued.getTime() + order.duration * 86_400_000);
}

/** Structure-vs-NPC-station order filter: true for a recognized NPC station, false for an unresolved player structure. */
export function isNpcStationOrder(
  order: { location_id: number },
  npcStations: ReadonlyMap<number, NpcStationLookup>
): boolean {
  return npcStations.has(order.location_id);
}
