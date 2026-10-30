/**
 * Selling into buy orders: which ones reach a station, and what a stack of
 * units fetches walking them dearest first (issue #5653).
 *
 * A buy order carries a `range`. `station` (or an order AT the station) reaches
 * only its own station; `solarsystem` its own system; `region` the whole region
 * the book was read from; a number reaches that many stargate jumps.
 * Jumps are counted over the plain gate graph by the caller (never Thera/Turnur
 * holes, Ansiblex or avoid costs), passed in as a system-id -> jumps map.
 *
 * Pure; the order books and the graph live in `features`.
 */
import { walkLadder } from './haulingMarket';

export interface ReachableBuyOrder {
  price: number;
  volumeRemain: number;
  /** ESI `min_volume`; absent counts as 1. */
  minVolume?: number;
  /** ESI `range`: `station`, `solarsystem`, `region` or a jump count as text. */
  range?: string;
  locationId: number;
  systemId: number;
}

export interface SellingStation {
  locationId: number;
  systemId: number;
}

/**
 * Does `order` fill a sale made at `station`? `jumpsFromStation` maps a system
 * id to its gate jumps from the station's system; absent, or missing the
 * order's system, a numbered range cannot be proven to reach, so it is skipped.
 * An order at the station always counts. An order with no `range` is read as
 * `station`, the one rule the app could always honour.
 */
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
  /** Units sold. */
  filled: number;
  /** Units the reachable book could not take: never priced, at zero or at the top bid. */
  unsold: number;
  /** ISK for `filled`, before tax. */
  revenue: number;
  /** `revenue / filled`; null when nothing sold. */
  average: number | null;
  /** The dearest reachable bid, or null with none. */
  topBid: number | null;
  /** Units the top bid itself took. */
  topBidTakes: number;
  /** The walk went past the top bid, so the average is below it. */
  movedPrice: boolean;
}

/**
 * Sells `units` into `orders`. Not Hauling's `walkInstant`: that pairs a buy
 * ladder with a sell ladder and has no per-order `minVolume`; only the
 * per-level fill is shared (`walkLadder`). `orders` are already filtered to
 * those that reach; they fill dearest first. An order whose `minVolume` exceeds the units still to sell at that
 * point is skipped.
 */
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
