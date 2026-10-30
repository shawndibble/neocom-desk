/**
 * The Appraisal page's live prices (issue #5591): one item's region order
 * book folded to the hub station, with the pilot's own orders told apart.
 *
 * Pure. The fetch, the 10-minute cache and the character orders live in
 * `features/market/liveBooks.ts`; this module only decides what a book means.
 *
 * Own orders are not competition. A pilot whose own order is the cheapest
 * sell (or ties it) matches it: the list copies that price unchanged instead
 * of undercutting themselves. Otherwise the undercut is one tick under the
 * cheapest seller, who is then a rival by construction.
 */
import type { AppraisalBuyWalk, AppraisalItem } from '@/engine/market/appraisal';
import {
  buyOrderReaches,
  walkSellIntoBuys,
  type ReachableBuyOrder,
} from '@/engine/market/buyReach';

/** The fields of a region order this module reads. */
export interface LiveOrder {
  order_id: number;
  is_buy_order: boolean;
  location_id: number;
  price: number;
  /** The fields the buy walk reads (issue #5653); absent on a book that carries none. */
  system_id?: number;
  range?: string;
  min_volume?: number;
  volume_remain?: number;
}

/** What the buy walk needs: the hub's system, its gate jumps to every system, and the units to sell. */
export interface BuyReach {
  systemId: number;
  jumps: ReadonlyMap<number, number> | undefined;
  units: number;
}

export interface LiveBookPrices {
  /** Cheapest sell at the station, or null where nobody sells. */
  sell: number | null;
  /** Richest buy at the station, or null where nobody buys. */
  buy: number | null;
  /** The pilot's own order is (or ties) the cheapest sell. */
  sellIsOwn: boolean;
  /** Set when `buy` is the walked average over `units` (see `BuyReach`), not the station's top bid. */
  buyWalk?: AppraisalBuyWalk;
}

/** One row's live book: its prices, `'failed'` after a failed fetch, undefined while still waiting. */
export type LiveBookLookup = LiveBookPrices | 'failed' | undefined;

/**
 * Folds `orders` to the station's best sell and buy. A price that is not positive is skipped, never free.
 * With `reach`, `buy` is instead what selling `reach.units` into every buy order that reaches the station
 * walks to, dearest first (null when none takes a unit); `buyWalk` says what the walk did.
 */
export function liveStationBook(
  orders: readonly LiveOrder[],
  stationId: number,
  ownOrderIds: ReadonlySet<number>,
  reach?: BuyReach
): LiveBookPrices {
  let sell: number | null = null;
  let buy: number | null = null;
  let ownSell: number | null = null;
  const reaching: ReachableBuyOrder[] = [];
  const station = { locationId: stationId, systemId: reach?.systemId ?? 0 };
  for (const order of orders) {
    if (!Number.isFinite(order.price) || order.price <= 0) continue;
    if (order.is_buy_order) {
      if (reach === undefined) {
        if (order.location_id === stationId)
          buy = buy === null ? order.price : Math.max(buy, order.price);
        continue;
      }
      const candidate: ReachableBuyOrder = {
        price: order.price,
        volumeRemain: order.volume_remain ?? 0,
        minVolume: order.min_volume,
        range: order.range,
        locationId: order.location_id,
        systemId: order.system_id ?? 0,
      };
      if (buyOrderReaches(candidate, station, reach.jumps)) reaching.push(candidate);
      continue;
    }
    if (order.location_id !== stationId) continue;
    sell = sell === null ? order.price : Math.min(sell, order.price);
    if (ownOrderIds.has(order.order_id)) {
      ownSell = ownSell === null ? order.price : Math.min(ownSell, order.price);
    }
  }
  const sellIsOwn = sell !== null && ownSell !== null && ownSell <= sell;
  if (reach === undefined) return { sell, buy, sellIsOwn };
  const walk = walkSellIntoBuys(reaching, reach.units);
  return {
    sell,
    buy: walk.average,
    sellIsOwn,
    ...(walk.topBid !== null && (walk.movedPrice || walk.unsold > 0)
      ? {
          buyWalk: {
            topBid: walk.topBid,
            topBidTakes: walk.topBidTakes,
            filled: walk.filled,
            unsold: walk.unsold,
            movedPrice: walk.movedPrice,
          },
        }
      : {}),
  };
}

/**
 * `items` with each row's prices swapped for its live book where one landed.
 * A live side with no orders is null: the book says nobody trades it, which
 * the stale figure would contradict. A row still waiting keeps its cached
 * price, marked `cached`; one whose fetch failed keeps it marked `failed`.
 */
export function applyLiveBooks(
  items: readonly AppraisalItem[],
  lookup: (typeId: number, quantity: number) => LiveBookLookup
): AppraisalItem[] {
  return items.map((item) => {
    const book = lookup(item.typeId, item.quantity);
    if (book === undefined) return { ...item, priceState: 'cached' };
    if (book === 'failed') return { ...item, priceState: 'failed' };
    return {
      ...item,
      buy: book.buy,
      sell: book.sell,
      sellIsOwn: book.sellIsOwn,
      buyWalk: book.buyWalk,
      priceState: 'live',
    };
  });
}
