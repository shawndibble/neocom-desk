/**
 * ISK per unit for named ores at a Trade Hub: the highest buy order of the
 * ore's Compressed form where it has one, as the Moon Mining Tax ledger prices
 * ore (`oreUnitPrices` in `features/miningTax/pricing.ts`). The read behind
 * `useOrePrices`, and what the Overview's Mining survey widget calls without a
 * component. Both pass the Mining page's price percent (issue #6531,
 * `pagePricePercents.ts`), applied here so the two never disagree; the shared
 * price lookups underneath stay at market.
 */
import type { TradeHub } from '@/market/hubs';
import { oreUnitPrices } from '@/features/miningTax/pricing';
import { atPercent } from '@/features/market/pagePricePercents';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';

export async function loadOrePrices(
  oreNames: readonly string[],
  hub: TradeHub,
  percent: number = DEFAULT_PRICE_PERCENT
): Promise<{ prices: ReadonlyMap<string, number>; compressed: boolean }> {
  const { prices, compressed } = await oreUnitPrices(oreNames, hub);
  if (percent === DEFAULT_PRICE_PERCENT) return { prices, compressed };
  return {
    prices: new Map([...prices].map(([ore, price]) => [ore, atPercent(price, percent)])),
    compressed,
  };
}
