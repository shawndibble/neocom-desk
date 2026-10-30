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
import type { AppraisalItem } from '@/engine/market/appraisal';

/** The fields of a region order this module reads. */
export interface LiveOrder {
  order_id: number;
  is_buy_order: boolean;
  location_id: number;
  price: number;
}

export interface LiveBookPrices {
  /** Cheapest sell at the station, or null where nobody sells. */
  sell: number | null;
  /** Richest buy at the station, or null where nobody buys. */
  buy: number | null;
  /** The pilot's own order is (or ties) the cheapest sell. */
  sellIsOwn: boolean;
}

/** One row's live book: its prices, `'failed'` after a failed fetch, undefined while still waiting. */
export type LiveBookLookup = LiveBookPrices | 'failed' | undefined;

/** Folds `orders` to the station's best sell and buy. A price that is not positive is skipped, never free. */
export function liveStationBook(
  orders: readonly LiveOrder[],
  stationId: number,
  ownOrderIds: ReadonlySet<number>
): LiveBookPrices {
  let sell: number | null = null;
  let buy: number | null = null;
  let ownSell: number | null = null;
  for (const order of orders) {
    if (order.location_id !== stationId) continue;
    if (!Number.isFinite(order.price) || order.price <= 0) continue;
    if (order.is_buy_order) {
      buy = buy === null ? order.price : Math.max(buy, order.price);
      continue;
    }
    sell = sell === null ? order.price : Math.min(sell, order.price);
    if (ownOrderIds.has(order.order_id)) {
      ownSell = ownSell === null ? order.price : Math.min(ownSell, order.price);
    }
  }
  return { sell, buy, sellIsOwn: sell !== null && ownSell !== null && ownSell <= sell };
}

/**
 * `items` with each row's prices swapped for its live book where one landed.
 * A live side with no orders is null: the book says nobody trades it, which
 * the stale figure would contradict. A row still waiting keeps its cached
 * price, marked `cached`; one whose fetch failed keeps it marked `failed`.
 */
export function applyLiveBooks(
  items: readonly AppraisalItem[],
  lookup: (typeId: number) => LiveBookLookup
): AppraisalItem[] {
  return items.map((item) => {
    const book = lookup(item.typeId);
    if (book === undefined) return { ...item, priceState: 'cached' };
    if (book === 'failed') return { ...item, priceState: 'failed' };
    return {
      ...item,
      buy: book.buy,
      sell: book.sell,
      sellIsOwn: book.sellIsOwn,
      priceState: 'live',
    };
  });
}
