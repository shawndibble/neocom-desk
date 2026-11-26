import type { SellBooks } from '@/engine/pi/planAdvice';
import { salesTaxPct } from '@/engine/industry/fees';

export interface HubPrices {
  prices: Readonly<Record<number, number>>;
  buyPrices: Readonly<Record<number, number>>;
}

export function hubBooks(
  prices: HubPrices,
  accountingLevel: number | null,
  feeDiscountFactor = 1
): SellBooks {
  return {
    prices: prices.prices,
    revenuePrices: { ...prices.prices, ...prices.buyPrices },
    salesTaxPct: salesTaxPct(accountingLevel ?? 0, feeDiscountFactor),
  };
}
