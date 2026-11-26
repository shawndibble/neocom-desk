import { brokerFee, salesTax } from '@/engine/industry/fees';
import type { AppraisalNetFees, AppraisalRow } from '../appraisal';

export interface FeeFigures {
  salesTax: number | null;
  brokerFee: number | null;
  afterFees: number | null;
}

const NO_FEES: FeeFigures = { salesTax: null, brokerFee: null, afterFees: null };

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
