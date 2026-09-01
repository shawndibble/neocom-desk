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

/** An order's expiry: issued + duration (days). */
export function orderExpiry(order: { issued: string; duration: number }): Date {
  const issued = new Date(order.issued);
  return new Date(issued.getTime() + order.duration * 86_400_000);
}
