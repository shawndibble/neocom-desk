import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { ResolvedStandings } from '@/engine/market/standings';

export interface OrderFeeContext {
  accountingLevel: number;
  brokerRelationsLevel: number;
  standing: ResolvedStandings;
}

export function orderFees(
  order: { price: number; is_buy_order: boolean },
  { accountingLevel, brokerRelationsLevel, standing }: OrderFeeContext
): { fees: number; finalPrice: number } {
  const taxPct = salesTaxPct(accountingLevel, standing.feeDiscountFactor);
  const brokerPct = order.is_buy_order
    ? 0
    : brokerFeePct(
        brokerRelationsLevel,
        standing.factionStanding,
        standing.corpStanding,
        standing.safetyTaxPct,
        standing.feeDiscountFactor
      );
  const fees = (order.price * (taxPct + brokerPct)) / 100;
  return { fees, finalPrice: order.price - fees };
}
