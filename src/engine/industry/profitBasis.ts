import { breakEvenPrice } from '@/engine/industry/fees';
import type { BuildResult } from '@/engine/industry/types';

/**
 * How a Build Plan counts the materials it takes from the pilot's own
 * hangars. `free` is the plan's own figure (owned units cost 0);
 * `sellValue` charges what those units would net if sold instead, so the
 * profit reads as what building earns over just selling them.
 */
export type ProfitBasis = 'free' | 'sellValue';

/** Below this much room between break-even and the market price, a profit is a close call. */
export const CLOSE_CALL_HEADROOM_PCT = 5;

export type ProfitVerdict = 'profitable' | 'closeCall' | 'loss' | 'unknown';

export interface ProfitBasisInput {
  result: Pick<
    BuildResult,
    'profit' | 'revenue' | 'marginPct' | 'iskPerHour' | 'breakEvenPrice' | 'totalCost' | 'seconds'
  >;
  /** What the owned materials this job consumes would net if sold; `null` when unknown. */
  ownedSellNet: number | null;
  productQuantity: number;
  productUnitPrice: number | null;
  accountingLevel: number;
  brokerRelationsLevel: number;
  factionStanding?: number;
  corpStanding?: number;
}

export interface ProfitOnBasis {
  profit: number | null;
  marginPct: number | null;
  iskPerHour: number | null;
  breakEvenPrice: number | null;
  /** How far the market price can fall before break-even, as % of the market price. */
  headroomPct: number | null;
  verdict: ProfitVerdict;
}

/**
 * The hero's figures on one basis. Same formulas as `buildVsBuy`: margin over
 * revenue, ISK/hour over the main job's time, break-even solved against the
 * market fees. The sell-value basis adds the forgone sale to the cost side.
 */
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
      input.corpStanding
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
