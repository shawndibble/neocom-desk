/**
 * "Is this order mine, and by how much am I beaten" for the Market Data
 * page's live order book table (routes/Market.tsx). Unlike `undercut.ts`'s
 * tiered station/system/region check for the Open Orders page — built from
 * separate, progressively more expensive fetches — this reads directly off
 * the order book the table is already rendering: no extra tier is needed,
 * since that book is already the full, un-aggregated region order list for
 * this one item.
 */
export interface OrderWithId {
  order_id: number;
  price: number;
}

export interface MyOrderGap {
  /** Best price among every order NOT mine on this side; null when nothing but my own order(s) are present. */
  bestOtherPrice: number | null;
  /** True when a rival strictly beats my price — equal doesn't count. */
  beaten: boolean;
  /**
   * |price - bestOtherPrice|, populated whenever `bestOtherPrice` is known,
   * regardless of `beaten` (I may already be the cheapest, and this is then
   * the gap to the next-best rival). Read together with `beaten`, never alone —
   * same convention as `openOrdersModel.ts`'s `StationTier`.
   */
  gapIsk: number | null;
  gapPct: number | null;
}

/**
 * For every order in `myOrderIds`, the best rival price on this side and the
 * gap to it. `orders` should be one side (sell or buy) of an order book,
 * already split by `splitOrderBook` — mixing sides would compare a sell
 * order's price against buy orders, which isn't a meaningful gap.
 *
 * Every one of `myOrderIds` is excluded from the "rival" pool, not just the
 * order being scored — a second order of mine on the same side must never
 * read as a rival beating the first.
 */
export function myOrderGaps<T extends OrderWithId>(
  orders: readonly T[],
  myOrderIds: ReadonlySet<number>,
  isBuyOrder: boolean
): ReadonlyMap<number, MyOrderGap> {
  const result = new Map<number, MyOrderGap>();
  if (myOrderIds.size === 0) return result;

  let bestOtherPrice: number | null = null;
  for (const order of orders) {
    if (myOrderIds.has(order.order_id)) continue;
    if (
      bestOtherPrice === null ||
      (isBuyOrder ? order.price > bestOtherPrice : order.price < bestOtherPrice)
    ) {
      bestOtherPrice = order.price;
    }
  }

  for (const order of orders) {
    if (!myOrderIds.has(order.order_id)) continue;
    const beaten =
      bestOtherPrice !== null &&
      (isBuyOrder ? bestOtherPrice > order.price : bestOtherPrice < order.price);
    const gapIsk = bestOtherPrice === null ? null : Math.abs(bestOtherPrice - order.price);
    const gapPct = gapIsk === null ? null : order.price > 0 ? (gapIsk / order.price) * 100 : 0;
    result.set(order.order_id, { bestOtherPrice, beaten, gapIsk, gapPct });
  }

  return result;
}
