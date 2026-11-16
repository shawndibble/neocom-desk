import type { AppraisalNetFees, AppraisalRow, RefineBasis } from '../appraisal';
import { feeFigures, type FeeFigures } from './feeFigures';
import { asIsFigures, refineFigures, type AsIsFigures, type RefineFigures } from './refineFigures';

/** Every derived figure one Appraisal row shows, on one Price Basis. */
export interface RowFigures {
  basis: RefineBasis;
  /** The midpoint of the buy-each and sell-each price; null unless both sides are priced. */
  splitEach: number | null;
  asIs: AsIsFigures;
  refine: RefineFigures;
  fees: FeeFigures;
}

/** The pile's figures on one Price Basis. */
export interface PileFigures {
  /** The Refine chip: the minerals alone, summed over the rows that have a figure on the basis. */
  refineMinerals: number;
  /** At least one row has a refine figure on the basis, so the Refine columns and chip earn a place. */
  refinable: boolean;
}

/**
 * The one record a table cell, a CSV column or a share view reads for a row.
 * The basis is the pilot's remembered Price Basis; there is no default, so a
 * caller can never quietly price on the buy side. `fees` null = the skills are
 * not known yet, and the fee figures are null.
 */
export function rowFigures(
  row: AppraisalRow,
  basis: RefineBasis,
  fees: AppraisalNetFees | null
): RowFigures {
  const asIs = asIsFigures(row, basis);
  return {
    basis,
    splitEach:
      row.buyEach === null || row.sellEach === null ? null : (row.buyEach + row.sellEach) / 2,
    asIs,
    refine: refineFigures(row, basis, asIs),
    fees: feeFigures(row, fees),
  };
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
