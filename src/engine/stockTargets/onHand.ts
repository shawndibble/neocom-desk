/**
 * What a pilot has on hand toward a **Stock List**: the units in every
 * Character's hangars plus the units still listed on their own sell orders.
 *
 * Sell orders count because an item put up for sale leaves the asset list —
 * for a pilot stocking a market, the stock on the shelf is mostly listed, and
 * counting hangars alone would read a full market as empty.
 */
import type { DetectedOwnedStockMap } from '@/engine/industry/ownedStock';

export interface OnHandOrder {
  type_id: number;
  location_id: number;
  volume_remain: number;
  is_buy_order?: boolean;
}

export interface OnHandCount {
  inHangars: number;
  listed: number;
  total: number;
}

/**
 * One count per listed type. `locationId` null counts everywhere; otherwise
 * only holdings and orders at that station or structure count.
 */
export function countOnHand(
  detected: DetectedOwnedStockMap,
  orders: readonly OnHandOrder[],
  locationId: number | null,
  typeIds: readonly number[]
): Map<number, OnHandCount> {
  const atLocation = (id: number) => locationId === null || id === locationId;
  const counts = new Map<number, OnHandCount>();
  for (const typeId of typeIds) {
    const placements = detected.get(typeId)?.placements ?? [];
    const inHangars = placements
      .filter((placement) => atLocation(placement.locationId))
      .reduce((sum, placement) => sum + placement.quantity, 0);
    counts.set(typeId, { inHangars, listed: 0, total: inHangars });
  }
  for (const order of orders) {
    if (order.is_buy_order === true || !atLocation(order.location_id)) continue;
    const count = counts.get(order.type_id);
    if (count === undefined) continue;
    count.listed += order.volume_remain;
    count.total += order.volume_remain;
  }
  return counts;
}
