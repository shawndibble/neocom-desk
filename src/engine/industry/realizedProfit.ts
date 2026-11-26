import { clamp } from '../math';
import { brokerFee, salesTax } from '@/engine/industry/fees';
import type { ResolvedStandings } from '@/engine/market/standings';

export interface RealizedProfitInputs {
  materialCost: number;
  jobFee: number;
  quantitySold: number;
  grossRevenue: number;
  accountingLevel: number;
  brokerFeeableRevenue: number;
  brokerRelationsLevel: number;
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
  marginPct: number | null;
}

export function realizedProfit(inputs: RealizedProfitInputs): RealizedProfitResult {
  const totalCost = inputs.materialCost + inputs.jobFee;
  const salesTaxAmount = salesTax(
    inputs.grossRevenue,
    inputs.accountingLevel,
    inputs.standing?.feeDiscountFactor
  );
  const brokerFeeAmount = brokerFee(
    inputs.brokerFeeableRevenue,
    inputs.brokerRelationsLevel,
    inputs.standing?.factionStanding,
    inputs.standing?.corpStanding,
    inputs.standing?.safetyTaxPct,
    inputs.standing?.feeDiscountFactor
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
  quantity: number;
  quantitySold: number;
  netRevenue: number;
  quantityLost?: number;
}

export interface SoldUnitsMargin {
  soldCost: number;
  margin: number;
  unsoldCost: number;
}

export function soldUnitsMargin(inputs: SoldUnitsMarginInputs): SoldUnitsMargin {
  const soldUnits = Math.min(inputs.quantitySold, inputs.quantity);
  const soldCost = inputs.quantity > 0 ? (inputs.totalCost / inputs.quantity) * soldUnits : 0;
  return {
    soldCost,
    margin: inputs.netRevenue - soldCost,
    unsoldCost:
      inputs.totalCost -
      soldCost -
      lostUnitsCost(inputs.totalCost, inputs.quantity, inputs.quantityLost ?? 0),
  };
}

export function lostUnitsCost(totalCost: number, quantity: number, quantityLost: number): number {
  if (quantity <= 0) return 0;
  return (totalCost / quantity) * clamp(quantityLost, 0, quantity);
}

export interface LossQuantityInputs {
  quantity: number;
  quantitySold: number;
  otherLost: number;
  quantityLost: number;
}

export function validateLossQuantity(i: LossQuantityInputs): 'invalid' | 'too-many' | null {
  if (!Number.isInteger(i.quantityLost) || i.quantityLost <= 0) return 'invalid';
  const unaccounted = Math.max(0, i.quantity - i.quantitySold - i.otherLost);
  return i.quantityLost > unaccounted ? 'too-many' : null;
}
