/**
 * Hub prices at a page's price percent (issue #6531): the page's own lookups
 * through `market/prices.ts`, scaled after the read. The lookups' cache is
 * per station and shared by every page, so the percent is applied here, on
 * the page's copy, never in that cache.
 */
import {
  getHubPrices,
  getHubPricesWithStatus,
  type HubAggregate,
  type PricesWithStatus,
} from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { atPercent } from './pagePricePercents';
import { DEFAULT_PRICE_PERCENT } from './pricePercent';

interface Sides {
  sellMin: number | null;
  buyMax: number | null;
}

function scaled<T extends Sides>(prices: ReadonlyMap<number, T>, percent: number): Map<number, T> {
  const out = new Map<number, T>();
  for (const [typeId, sides] of prices) {
    out.set(typeId, {
      ...sides,
      sellMin: sides.sellMin === null ? null : atPercent(sides.sellMin, percent),
      buyMax: sides.buyMax === null ? null : atPercent(sides.buyMax, percent),
    });
  }
  return out;
}

/** Each type's sell and buy price at `percent`; everything else (volumes) stays as it is. */
export function scaleHubPrices<T extends Sides>(
  prices: ReadonlyMap<number, T>,
  percent: number
): ReadonlyMap<number, T> {
  return percent === DEFAULT_PRICE_PERCENT ? prices : scaled(prices, percent);
}

/** `getHubPrices` at `percent` of market. */
export async function getHubPricesAt(
  hub: TradeHub,
  typeIds: readonly number[],
  percent: number
): Promise<Map<number, HubAggregate>> {
  const prices = await getHubPrices(hub, [...typeIds]);
  return percent === DEFAULT_PRICE_PERCENT ? prices : scaled(prices, percent);
}

/** `getHubPricesWithStatus` at `percent` of market. */
export async function getHubPricesWithStatusAt(
  hub: TradeHub,
  typeIds: readonly number[],
  percent: number
): Promise<PricesWithStatus> {
  const result = await getHubPricesWithStatus(hub, [...typeIds]);
  if (percent === DEFAULT_PRICE_PERCENT) return result;
  return { ...result, prices: scaled(result.prices, percent) };
}
