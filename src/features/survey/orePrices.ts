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
