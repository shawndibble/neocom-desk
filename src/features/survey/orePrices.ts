/**
 * ISK per unit for named ores at a Trade Hub: the highest buy order of the
 * ore's Compressed form where it has one, as the Moon Mining Tax ledger prices
 * ore (`oreUnitPrices` in `features/miningTax/pricing.ts`). The read behind
 * `useOrePrices`, and what the Overview's Mining survey widget calls without a
 * component.
 */
import type { TradeHub } from '@/market/hubs';
import { oreUnitPrices } from '@/features/miningTax/pricing';

export function loadOrePrices(
  oreNames: readonly string[],
  hub: TradeHub
): Promise<{ prices: ReadonlyMap<string, number>; compressed: boolean }> {
  return oreUnitPrices(oreNames, hub);
}
