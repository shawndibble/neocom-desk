/**
 * Keeping the market-wide scan honest about what a product actually sells
 * for, and how often. Pure: the caller supplies CCP's average prices and the
 * regions' daily history.
 */
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';

/**
 * A hub sell price above this multiple of CCP's average traded price is a
 * troll order, not a market: a thin item (special editions, officer drops)
 * can have nothing listed below a joke price, and ranking it at that price
 * put 78.9T ISK/hour at the top. Wide enough for a hub's normal premium over
 * the galaxy-wide average.
 */
export const TROLL_PRICE_RATIO = 3;

/**
 * What to sell a product at: the hub's cheapest sell order, unless it is a
 * troll price, then the average it actually trades at (`capped`). Null when
 * there is no sell order, or the item has never traded (no average): no
 * price would be anything but a guess.
 */
export function reliableSellPrice(
  hubSellMin: number | null,
  averagePrice: number | null
): { price: number; capped: boolean } | null {
  if (hubSellMin === null || averagePrice === null || averagePrice <= 0) return null;
  return hubSellMin > averagePrice * TROLL_PRICE_RATIO
    ? { price: averagePrice, capped: true }
    : { price: hubSellMin, capped: false };
}

/** How many days back `averageDailyVolume` looks. */
export const SALES_WINDOW_DAYS = 30;

/** Fewer units a day than this, and a product "rarely sells". */
export const RARELY_SOLD_PER_DAY = 5;

const DAY_MS = 86_400_000;

/**
 * Units traded per day over the last `SALES_WINDOW_DAYS`, summed across
 * every region's history. Divided by the whole window, not by the days with
 * trades: ESI omits a day nothing traded, and that day is a zero.
 */
export function averageDailyVolume(
  histories: readonly (readonly MarketHistoryPoint[])[],
  nowMs: number
): number {
  const since = nowMs - SALES_WINDOW_DAYS * DAY_MS;
  let units = 0;
  for (const history of histories) {
    for (const point of history) {
      if (Date.parse(`${point.date}T00:00:00Z`) >= since) units += point.volume;
    }
  }
  return units / SALES_WINDOW_DAYS;
}

/**
 * Orders that traded per day over the last `SALES_WINDOW_DAYS` in one region's
 * history (ESI's `order_count`). Same whole-window divisor as
 * `averageDailyVolume`: an omitted day is a zero.
 */
export function averageDailyOrders(history: readonly MarketHistoryPoint[], nowMs: number): number {
  const since = nowMs - SALES_WINDOW_DAYS * DAY_MS;
  let orders = 0;
  for (const point of history) {
    if (Date.parse(`${point.date}T00:00:00Z`) >= since) orders += point.orderCount;
  }
  return orders / SALES_WINDOW_DAYS;
}

export function isRarelySold(unitsPerDay: number): boolean {
  return unitsPerDay < RARELY_SOLD_PER_DAY;
}
