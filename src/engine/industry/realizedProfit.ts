/**
 * Realized profit for a logged Production Run (issue #525): what a run's
 * snapshotted build cost nets against what has actually sold so far, as
 * opposed to `buildVsBuy`'s forward *estimate* against a live market price.
 *
 * `grossRevenue` is the sum of every confirmed sale line (a linked past
 * wallet transaction, or the filled portion of a watched sell order) —
 * confirmed only, never extrapolated, so a run always understates rather
 * than overstates until every unit is accounted for.
 *
 * Sales tax is charged on all of `grossRevenue` (ESI deducts it from every
 * sale regardless of how it was made), but broker fee is charged only on
 * `brokerFeeableRevenue` — the portion confirmed via a **watched sell
 * order**, since that is the one path this app knows for certain paid a
 * broker fee at listing time. A linked past wallet transaction may equally
 * have been an instant sell into a buy order, which pays no broker fee, and
 * ESI's transaction record does not say which — so no broker fee is ever
 * assumed there. This is a deliberate simplification (see the Production
 * Log scope decision), not full order-level accounting.
 */

import { brokerFee, salesTax } from '@/engine/industry/fees';

export interface RealizedProfitInputs {
  /** Snapshotted from the Build Plan at logging time, user-overridable. */
  materialCost: number;
  jobFee: number;
  /** Confirmed units sold so far (linked transactions + watched-order fills). */
  quantitySold: number;
  /** Sum of quantity x unit price across every confirmed sale line. */
  grossRevenue: number;
  accountingLevel: number;
  /** Portion of `grossRevenue` confirmed via a watched sell order — see module doc. */
  brokerFeeableRevenue: number;
  brokerRelationsLevel: number;
}

export interface RealizedProfitResult {
  totalCost: number;
  quantitySold: number;
  grossRevenue: number;
  salesTax: number;
  brokerFee: number;
  netRevenue: number;
  profit: number;
  /** Null while nothing has sold yet — a percentage of zero revenue is not a number. */
  marginPct: number | null;
}

export function realizedProfit(inputs: RealizedProfitInputs): RealizedProfitResult {
  const totalCost = inputs.materialCost + inputs.jobFee;
  const salesTaxAmount = salesTax(inputs.grossRevenue, inputs.accountingLevel);
  const brokerFeeAmount = brokerFee(inputs.brokerFeeableRevenue, inputs.brokerRelationsLevel);
  const netRevenue = inputs.grossRevenue - salesTaxAmount - brokerFeeAmount;
  const profit = netRevenue - totalCost;

  return {
    totalCost,
    quantitySold: inputs.quantitySold,
    grossRevenue: inputs.grossRevenue,
    salesTax: salesTaxAmount,
    brokerFee: brokerFeeAmount,
    netRevenue,
    profit,
    marginPct: inputs.grossRevenue > 0 ? (profit / inputs.grossRevenue) * 100 : null,
  };
}
