import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { parseInstant } from '../esiInstant';
import { DAY_MS } from '@/lib/age';

export const TROLL_PRICE_RATIO = 3;

export function reliableSellPrice(
  hubSellMin: number | null,
  averagePrice: number | null
): { price: number; capped: boolean } | null {
  if (hubSellMin === null || averagePrice === null || averagePrice <= 0) return null;
  return hubSellMin > averagePrice * TROLL_PRICE_RATIO
    ? { price: averagePrice, capped: true }
    : { price: hubSellMin, capped: false };
}

export function cappedSellPrice(
  hubSellMin: number,
  averagePrice: number | null | undefined
): { price: number; capped: boolean } {
  return (
    reliableSellPrice(hubSellMin, averagePrice ?? null) ?? { price: hubSellMin, capped: false }
  );
}

const SALES_WINDOW_DAYS = 30;

export const RARELY_SOLD_PER_DAY = 5;

export function averageDailyVolume(
  histories: readonly (readonly MarketHistoryPoint[])[],
  nowMs: number
): number {
  const since = nowMs - SALES_WINDOW_DAYS * DAY_MS;
  let units = 0;
  for (const history of histories) {
    for (const point of history) {
      if ((parseInstant(`${point.date}T00:00:00Z`) ?? -Infinity) >= since) units += point.volume;
    }
  }
  return units / SALES_WINDOW_DAYS;
}

export function averageDailyOrders(history: readonly MarketHistoryPoint[], nowMs: number): number {
  const since = nowMs - SALES_WINDOW_DAYS * DAY_MS;
  let orders = 0;
  for (const point of history) {
    if ((parseInstant(`${point.date}T00:00:00Z`) ?? -Infinity) >= since) orders += point.orderCount;
  }
  return orders / SALES_WINDOW_DAYS;
}

export function isRarelySold(unitsPerDay: number): boolean {
  return unitsPerDay < RARELY_SOLD_PER_DAY;
}
