import type { SellBooks } from '@/engine/pi/planAdvice';
import { salesTaxPct } from '@/engine/industry/fees';

/** Sell prices as the loaders return them: the ask, and the hub's buy orders. */
export interface HubPrices {
  prices: Readonly<Record<number, number>>;
  buyPrices: Readonly<Record<number, number>>;
}

/**
 * The hub's books for the engine: a sale is valued at the bid, falling back to
 * the ask for a type with no buy order (the Advisor's `revenuePrices` rule), and
 * unknown Accounting prices at level 0, the highest tax.
 */
export function hubBooks(prices: HubPrices, accountingLevel: number | null): SellBooks {
  return {
    prices: prices.prices,
    revenuePrices: { ...prices.prices, ...prices.buyPrices },
    salesTaxPct: salesTaxPct(accountingLevel ?? 0),
  };
}
