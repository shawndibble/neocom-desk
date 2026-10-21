/**
 * One item's open orders folded to what Fuzzwork's station aggregate reports:
 * best price, units and order count per side. The price fallback uses it when
 * Fuzzwork is down, so a station reads the same whichever source answered.
 */
export interface StationBookOrder {
  is_buy_order: boolean;
  location_id: number;
  price: number;
  volume_remain: number;
}

export interface StationBook {
  /** Lowest sell price, or null when no priced sell order stands. */
  sellMin: number | null;
  /** Highest buy price, or null when no priced buy order stands. */
  buyMax: number | null;
  sellVolume: number;
  buyVolume: number;
  sellOrders: number;
  buyOrders: number;
}

/**
 * Folds `orders` to a `StationBook`. With a `locationId` only orders placed at
 * that station count (Fuzzwork groups by the placing station, buy range
 * ignored); `null` keeps the whole region. A price that is not a positive
 * number is skipped, never taken as free.
 */
export function summarizeStationBook(
  orders: readonly StationBookOrder[],
  locationId: number | null
): StationBook {
  const book: StationBook = {
    sellMin: null,
    buyMax: null,
    sellVolume: 0,
    buyVolume: 0,
    sellOrders: 0,
    buyOrders: 0,
  };
  for (const order of orders) {
    if (locationId !== null && order.location_id !== locationId) continue;
    if (!Number.isFinite(order.price) || order.price <= 0) continue;
    if (order.is_buy_order) {
      book.buyOrders += 1;
      book.buyVolume += order.volume_remain;
      book.buyMax = book.buyMax === null ? order.price : Math.max(book.buyMax, order.price);
    } else {
      book.sellOrders += 1;
      book.sellVolume += order.volume_remain;
      book.sellMin = book.sellMin === null ? order.price : Math.min(book.sellMin, order.price);
    }
  }
  return book;
}
