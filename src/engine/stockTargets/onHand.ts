/**
 * What a pilot has toward a market's **Stock List**: the units still listed on
 * their own sell orders there, and the units in their hangars at the same
 * station or structure, ready to list.
 *
 * Only the pilot's own orders count: the list is about the market they stock,
 * and reading every seller at a player structure would need a structure-market
 * scope the pilot may not hold there.
 */
import type { DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import type { StockTarget } from './stockLists';

export interface OnHandOrder {
  type_id: number;
  location_id: number;
  volume_remain: number;
  is_buy_order?: boolean;
}

export interface MarketCount {
  listed: number;
  inHangar: number;
}

const isSellAt = (order: OnHandOrder, locationId: number) =>
  order.is_buy_order !== true && order.location_id === locationId;

/** One count per listed type, at one market. */
export function countAtMarket(
  detected: DetectedOwnedStockMap,
  orders: readonly OnHandOrder[],
  locationId: number,
  typeIds: readonly number[]
): Map<number, MarketCount> {
  const counts = new Map<number, MarketCount>();
  for (const typeId of typeIds) {
    const inHangar = (detected.get(typeId)?.placements ?? [])
      .filter((placement) => placement.locationId === locationId)
      .reduce((sum, placement) => sum + placement.quantity, 0);
    counts.set(typeId, { listed: 0, inHangar });
  }
  for (const order of orders) {
    if (!isSellAt(order, locationId)) continue;
    const count = counts.get(order.type_id);
    if (count !== undefined) count.listed += order.volume_remain;
  }
  return counts;
}

/**
 * The pilot's sell orders at a market as Stock Targets of what is listed now,
 * in first-listed order: the starting point for a market they already stock.
 */
export function listedAtMarket(orders: readonly OnHandOrder[], locationId: number): StockTarget[] {
  const totals = new Map<number, number>();
  for (const order of orders) {
    if (!isSellAt(order, locationId) || order.volume_remain <= 0) continue;
    totals.set(order.type_id, (totals.get(order.type_id) ?? 0) + order.volume_remain);
  }
  return [...totals].map(([typeId, target]) => ({ typeId, target }));
}
