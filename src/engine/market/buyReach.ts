import { walkLadder } from './haulingMarket';

export interface ReachableBuyOrder {
  price: number;
  volumeRemain: number;
  minVolume?: number;
  range?: string;
  locationId: number;
  systemId: number;
}

export interface SellingStation {
  locationId: number;
  systemId: number;
}

export function buyOrderReaches(
  order: ReachableBuyOrder,
  station: SellingStation,
  jumpsFromStation: ReadonlyMap<number, number> | undefined
): boolean {
  if (order.locationId === station.locationId) return true;
  switch (order.range) {
    case undefined:
    case 'station':
      return false;
    case 'region':
      return true;
    case 'solarsystem':
      return order.systemId === station.systemId;
    default: {
      const reach = Number(order.range);
      const jumps = jumpsFromStation?.get(order.systemId);
      return Number.isFinite(reach) && jumps !== undefined && reach >= jumps;
    }
  }
}

export interface BuyWalk {
  filled: number;
  unsold: number;
  revenue: number;
  average: number | null;
  topBid: number | null;
  topBidTakes: number;
  movedPrice: boolean;
}

export function walkSellIntoBuys(orders: readonly ReachableBuyOrder[], units: number): BuyWalk {
  const sorted = [...orders]
    .filter((o) => Number.isFinite(o.price) && o.price > 0 && o.volumeRemain > 0)
    .sort((a, b) => b.price - a.price);
  const total = Math.max(0, Math.floor(units));
  let remaining = total;
  let revenue = 0;
  let topBid: number | null = null;
  let topBidTakes = 0;
  for (const order of sorted) {
    if (remaining <= 0) break;
    if ((order.minVolume ?? 1) > remaining) continue;
    const { filled, cost } = walkLadder(
      [{ price: order.price, units: order.volumeRemain, orders: 1 }],
      remaining
    );
    if (filled <= 0) continue;
    if (topBid === null) {
      topBid = order.price;
      topBidTakes = filled;
    } else if (order.price === topBid) {
      topBidTakes += filled;
    }
    revenue += cost;
    remaining -= filled;
  }
  const filled = total - remaining;
  return {
    filled,
    unsold: remaining,
    revenue,
    average: filled > 0 ? revenue / filled : null,
    topBid,
    topBidTakes,
    movedPrice: topBid !== null && filled > topBidTakes,
  };
}
