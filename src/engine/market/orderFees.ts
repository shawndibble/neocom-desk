import { brokerFeePct, salesTaxPct } from '@/engine/industry/fees';
import type { ResolvedStandings } from '@/engine/market/standings';

/** What the pilot's skills and standing do to the fees; every field is known before any figure is shown. */
export interface OrderFeeContext {
  accountingLevel: number;
  brokerRelationsLevel: number;
  /** Standing toward the station owner of the market being read; zero where none applies. */
  standing: ResolvedStandings;
}

/**
 * What an order's price would cost and pay you, per unit.
 *
 * - A **buy order** is something you sell into now: sales tax comes off what
 *   reaches your wallet, and no broker fee is charged on an outright trade.
 * - A **sell order** is priced as if you listed your own at the same price:
 *   the broker fee when you place it and the sales tax when it sells. (Buying
 *   from it outright costs the buyer neither.)
 *
 * The broker fee is the rate at this price, so a single unit does not show
 * the 100 ISK per-order minimum (`fees.ts#brokerFee`). `finalPrice` is what
 * reaches the wallet.
 */
export function orderFees(
  order: { price: number; is_buy_order: boolean },
  { accountingLevel, brokerRelationsLevel, standing }: OrderFeeContext
): { fees: number; finalPrice: number } {
  const taxPct = salesTaxPct(accountingLevel);
  const brokerPct = order.is_buy_order
    ? 0
    : brokerFeePct(
        brokerRelationsLevel,
        standing.factionStanding,
        standing.corpStanding,
        standing.brokerSurchargePct
      );
  const fees = (order.price * (taxPct + brokerPct)) / 100;
  return { fees, finalPrice: order.price - fees };
}
