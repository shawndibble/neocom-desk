/**
 * What selling one Appraisal row's sell total as one sell order costs in fees.
 * Internal to `appraisalRowFigures`: callers read `rowFigures(...).fees`.
 */
import { brokerFee, salesTax } from '@/engine/industry/fees';
import type { AppraisalNetFees, AppraisalRow } from '../appraisal';

export interface FeeFigures {
  /** Sales tax on the sell total at the Accounting level's rate. */
  salesTax: number | null;
  /** Broker fee for listing the sell total, at Broker Relations and hub standings (100 ISK minimum). */
  brokerFee: number | null;
  /** The sell total less both. */
  afterFees: number | null;
}

const NO_FEES: FeeFigures = { salesTax: null, brokerFee: null, afterFees: null };

/**
 * Null throughout where nothing sells (no price is not a free 0), or where the
 * fee inputs are `null` because the skills are not known yet (never a
 * base-rate guess).
 */
export function feeFigures(
  row: Pick<AppraisalRow, 'sellTotal'>,
  fees: AppraisalNetFees | null
): FeeFigures {
  if (fees === null || row.sellTotal === null) return NO_FEES;
  const { accountingLevel, brokerRelationsLevel, standing } = fees;
  const tax = salesTax(row.sellTotal, accountingLevel, standing.feeDiscountFactor);
  const broker = brokerFee(
    row.sellTotal,
    brokerRelationsLevel,
    standing.factionStanding,
    standing.corpStanding,
    standing.safetyTaxPct,
    standing.feeDiscountFactor
  );
  return { salesTax: tax, brokerFee: broker, afterFees: row.sellTotal - tax - broker };
}
