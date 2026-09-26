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
import type { ResolvedStandings } from '@/engine/market/standings';

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
  /** The character's standing toward the watched order's station owner. Absent/0 = standings assumed 0. */
  standing?: ResolvedStandings;
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
  const brokerFeeAmount = brokerFee(
    inputs.brokerFeeableRevenue,
    inputs.brokerRelationsLevel,
    inputs.standing?.factionStanding,
    inputs.standing?.corpStanding
  );
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

export interface SoldUnitsMarginInputs {
  totalCost: number;
  /** Units the run produced. */
  quantity: number;
  /** Confirmed units sold so far. */
  quantitySold: number;
  netRevenue: number;
}

export interface SoldUnitsMargin {
  /** Unit cost x confirmed units sold — the only cost the sold units can be charged. */
  soldCost: number;
  /** Net revenue less `soldCost`: provable from confirmed sales alone, unlike `realizedProfit`'s conservative headline. */
  margin: number;
  /** The cost still sitting in unsold units. */
  unsoldCost: number;
}

/** A second, provable view beside `realizedProfit` (issue #1785): charges only the sold units' share of the run cost. */
export function soldUnitsMargin(inputs: SoldUnitsMarginInputs): SoldUnitsMargin {
  const soldUnits = Math.min(inputs.quantitySold, inputs.quantity);
  const soldCost = inputs.quantity > 0 ? (inputs.totalCost / inputs.quantity) * soldUnits : 0;
  return {
    soldCost,
    margin: inputs.netRevenue - soldCost,
    unsoldCost: inputs.totalCost - soldCost,
  };
}
