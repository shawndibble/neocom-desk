import { breakEvenPrice } from '@/engine/industry/fees';
import type { BuildResult } from '@/engine/industry/types';

export type ProfitBasis = 'free' | 'sellValue';

export const CLOSE_CALL_HEADROOM_PCT = 5;

export type ProfitVerdict = 'profitable' | 'closeCall' | 'loss' | 'unknown';

export interface ProfitBasisInput {
  result: Pick<
    BuildResult,
    'profit' | 'revenue' | 'marginPct' | 'iskPerHour' | 'breakEvenPrice' | 'totalCost' | 'seconds'
  >;
  ownedSellNet: number | null;
  productQuantity: number;
  productUnitPrice: number | null;
  accountingLevel: number;
  brokerRelationsLevel: number;
  factionStanding?: number;
  safetyTaxPct?: number;
  feeDiscountFactor?: number;
  corpStanding?: number;
}

export interface ProfitOnBasis {
  profit: number | null;
  marginPct: number | null;
  iskPerHour: number | null;
  breakEvenPrice: number | null;
  headroomPct: number | null;
  verdict: ProfitVerdict;
}

export function profitOnBasis(basis: ProfitBasis, input: ProfitBasisInput): ProfitOnBasis {
  const { result, ownedSellNet, productQuantity, productUnitPrice } = input;
  const forgone = basis === 'sellValue' && ownedSellNet !== null ? ownedSellNet : 0;

  let { profit, marginPct, iskPerHour, breakEvenPrice: breakEven } = result;
  if (forgone !== 0) {
    profit = profit === null ? null : profit - forgone;
    marginPct =
      profit !== null && result.revenue !== null && result.revenue > 0
        ? (profit / result.revenue) * 100
        : null;
    iskPerHour = profit !== null && result.seconds > 0 ? profit / (result.seconds / 3600) : null;
    breakEven = breakEvenPrice(
      result.totalCost + forgone,
      productQuantity,
      input.accountingLevel,
      input.brokerRelationsLevel,
      input.factionStanding,
      input.corpStanding,
      input.safetyTaxPct,
      input.feeDiscountFactor
    );
  }

  const headroomPct =
    breakEven !== null && productUnitPrice !== null && productUnitPrice > 0
      ? ((productUnitPrice - breakEven) / productUnitPrice) * 100
      : null;

  let verdict: ProfitVerdict = 'unknown';
  if (profit !== null) {
    if (profit < 0) verdict = 'loss';
    else if (headroomPct !== null && headroomPct < CLOSE_CALL_HEADROOM_PCT) verdict = 'closeCall';
    else verdict = 'profitable';
  }

  return { profit, marginPct, iskPerHour, breakEvenPrice: breakEven, headroomPct, verdict };
}
