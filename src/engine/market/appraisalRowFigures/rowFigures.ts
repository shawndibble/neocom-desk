import type { AppraisalNetFees, AppraisalRow, RefineBasis } from '../appraisal';
import { feeFigures, type FeeFigures } from './feeFigures';
import { asIsFigures, refineFigures, type AsIsFigures, type RefineFigures } from './refineFigures';

export { asIsFigures };

export interface BasisFreeFigures {
  splitEach: number | null;
  fees: FeeFigures;
}

export interface RowFigures extends BasisFreeFigures {
  basis: RefineBasis;
  asIs: AsIsFigures;
  refine: RefineFigures;
}

export interface PileFigures {
  refineMinerals: number;
  refinable: boolean;
}

export function basisFreeFigures(
  row: AppraisalRow,
  fees: AppraisalNetFees | null
): BasisFreeFigures {
  return {
    splitEach:
      row.buyEach === null || row.sellEach === null ? null : (row.buyEach + row.sellEach) / 2,
    fees: feeFigures(row, fees),
  };
}

export function rowFigures(
  row: AppraisalRow,
  basis: RefineBasis,
  fees: AppraisalNetFees | null
): RowFigures {
  const asIs = asIsFigures(row, basis);
  return { ...basisFreeFigures(row, fees), basis, asIs, refine: refineFigures(row, basis, asIs) };
}

export function pileFigures(rows: readonly AppraisalRow[], basis: RefineBasis): PileFigures {
  let refineMinerals = 0;
  let refinable = false;
  for (const row of rows) {
    const { minerals } = refineFigures(row, basis, asIsFigures(row, basis));
    if (minerals === undefined) continue;
    refinable = true;
    refineMinerals += minerals;
  }
  return { refineMinerals, refinable };
}
