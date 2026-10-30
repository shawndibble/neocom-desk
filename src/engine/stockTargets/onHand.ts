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
  /** Whose order it is: only needed for the per-Character split. */
  characterId?: number;
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

/** One Character's share of a count. */
export interface HolderCount {
  characterId: number;
  quantity: number;
}

export interface MarketHolders {
  listedBy: HolderCount[];
  inHangarBy: HolderCount[];
}

function addHolder(shares: Map<number, number>, characterId: number, quantity: number) {
  shares.set(characterId, (shares.get(characterId) ?? 0) + quantity);
}

const biggestFirst = (shares: Map<number, number>): HolderCount[] =>
  [...shares]
    .map(([characterId, quantity]) => ({ characterId, quantity }))
    .filter((share) => share.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || a.characterId - b.characterId);

/**
 * Whose units make up `countAtMarket`'s two counts, per type: attribution, not a
 * new count, so each list sums to its total. Biggest holder first.
 */
export function holdersAtMarket(
  detected: DetectedOwnedStockMap,
  orders: readonly OnHandOrder[],
  locationId: number,
  typeIds: readonly number[]
): Map<number, MarketHolders> {
  const listed = new Map<number, Map<number, number>>();
  for (const order of orders) {
    if (!isSellAt(order, locationId) || order.characterId === undefined) continue;
    const shares = listed.get(order.type_id) ?? new Map<number, number>();
    addHolder(shares, order.characterId, order.volume_remain);
    listed.set(order.type_id, shares);
  }
  const result = new Map<number, MarketHolders>();
  for (const typeId of typeIds) {
    const hangar = new Map<number, number>();
    for (const placement of detected.get(typeId)?.placements ?? []) {
      if (placement.locationId === locationId) {
        addHolder(hangar, placement.characterId, placement.quantity);
      }
    }
    result.set(typeId, {
      listedBy: biggestFirst(listed.get(typeId) ?? new Map()),
      inHangarBy: biggestFirst(hangar),
    });
  }
  return result;
}

/** Characters with a sell order at a market, most orders first: whose market it is. */
export function sellersAtMarket(orders: readonly OnHandOrder[], locationId: number): number[] {
  const orderCounts = new Map<number, number>();
  for (const order of orders) {
    if (!isSellAt(order, locationId) || order.characterId === undefined) continue;
    addHolder(orderCounts, order.characterId, 1);
  }
  return biggestFirst(orderCounts).map((share) => share.characterId);
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
