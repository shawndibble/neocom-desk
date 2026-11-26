import type { DetectedOwnedStockMap } from '@/engine/industry/ownedStock';
import type { StockTarget } from './stockLists';

export interface OnHandOrder {
  type_id: number;
  location_id: number;
  volume_remain: number;
  is_buy_order?: boolean;
  characterId?: number;
}

export interface MarketCount {
  listed: number;
  inHangar: number;
}

const isSellAt = (order: OnHandOrder, locationId: number) =>
  order.is_buy_order !== true && order.location_id === locationId;

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

export interface HolderCount {
  characterId: number;
  quantity: number;
}

export interface MarketHolders {
  listedBy: HolderCount[];
  inHangarBy: HolderCount[];
}

export const totalOf = (holders: readonly HolderCount[]): number =>
  holders.reduce((sum, holder) => sum + holder.quantity, 0);

function addHolder(shares: Map<number, number>, characterId: number, quantity: number) {
  shares.set(characterId, (shares.get(characterId) ?? 0) + quantity);
}

export const biggestFirst = (shares: Map<number, number>): HolderCount[] =>
  [...shares]
    .map(([characterId, quantity]) => ({ characterId, quantity }))
    .filter((share) => share.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || a.characterId - b.characterId);

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

export function sellersAtMarket(orders: readonly OnHandOrder[], locationId: number): number[] {
  const orderCounts = new Map<number, number>();
  for (const order of orders) {
    if (!isSellAt(order, locationId) || order.characterId === undefined) continue;
    addHolder(orderCounts, order.characterId, 1);
  }
  return biggestFirst(orderCounts).map((share) => share.characterId);
}

export function listedAtMarket(orders: readonly OnHandOrder[], locationId: number): StockTarget[] {
  const totals = new Map<number, number>();
  for (const order of orders) {
    if (!isSellAt(order, locationId) || order.volume_remain <= 0) continue;
    totals.set(order.type_id, (totals.get(order.type_id) ?? 0) + order.volume_remain);
  }
  return [...totals].map(([typeId, target]) => ({ typeId, target }));
}
