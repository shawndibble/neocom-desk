import { salesTax } from '@/engine/industry/fees';

/**
 * What taking an order outright costs or pays, per unit. Hitting a buy order
 * is a sale, so sales tax comes off what you receive; buying from a sell
 * order outright is taxed and fee-free in EVE (broker fees are for listing
 * your own order, and none is placed here). `finalPrice` is what leaves or
 * reaches the wallet.
 */
export function orderFees(
  order: { price: number; is_buy_order: boolean },
  accountingLevel: number
): { fees: number; finalPrice: number } {
  const fees = order.is_buy_order ? salesTax(order.price, accountingLevel) : 0;
  return { fees, finalPrice: order.price - fees };
}
